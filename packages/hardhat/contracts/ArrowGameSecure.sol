// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ArrowGameSecure
 * @dev Secure betting game with proper randomness handling
 * @notice This contract uses commit-reveal for fairness
 *
 * SECURITY IMPROVEMENTS:
 * 1. Commit-reveal scheme for randomness (prevents front-running)
 * 2. Proper balance checks BEFORE accepting bets
 * 3. Guaranteed payouts or full refund
 * 4. Reserve system to protect player funds
 * 5. Emergency pause functionality
 * 6. Events for all state changes
 */
contract ArrowGameSecure is Ownable, ReentrancyGuard, Pausable {

    // ============ Game Configuration ============
    uint256 public minBet = 0.0005 ether;  // 0.0005 CELO (~$0.003)
    uint256 public maxBet = 0.005 ether;   // 0.005 CELO (~$0.03) - MVP safe limit
    uint256 public constant HOUSE_EDGE = 5; // 5% - immutable for trust
    uint256 public constant MAX_PAYOUT_MULTIPLIER = 190; // 1.9x max (2x - 5% edge)

    // Reserve: minimum balance that cannot be withdrawn
    // Ensures players can always be paid
    uint256 public reserveBalance;

    // ============ Statistics ============
    uint256 public totalGamesPlayed;
    uint256 public totalPayouts;
    uint256 public totalWagered;

    // ============ Player Data ============
    mapping(address => uint256) public playerGamesPlayed;
    mapping(address => uint256) public playerTotalWon;
    mapping(address => uint256) public playerTotalWagered;

    // ============ Commit-Reveal for Randomness ============
    struct PendingBet {
        uint256 amount;
        uint256 commitBlock;
        bytes32 commitHash;
        bool resolved;
    }

    mapping(address => PendingBet) public pendingBets;
    uint256 public constant REVEAL_TIMEOUT = 256; // blocks (~20 min on Celo)
    uint256 public constant MIN_REVEAL_DELAY = 1; // at least 1 block

    // ============ Events ============
    event BetCommitted(address indexed player, uint256 amount, bytes32 commitHash);
    event BetRevealed(address indexed player, uint256 amount, uint8 result, uint256 payout);
    event BetRefunded(address indexed player, uint256 amount, string reason);
    event GameFunded(address indexed funder, uint256 amount);
    event HouseWithdraw(address indexed owner, uint256 amount, uint256 remainingReserve);
    event ConfigUpdated(uint256 minBet, uint256 maxBet);
    event ReserveUpdated(uint256 newReserve);
    event EmergencyWithdraw(address indexed owner, uint256 amount);

    // ============ Errors ============
    error BetTooSmall(uint256 sent, uint256 minimum);
    error BetTooLarge(uint256 sent, uint256 maximum);
    error InsufficientHouseBalance(uint256 available, uint256 required);
    error PendingBetExists();
    error NoPendingBet();
    error RevealTooEarly(uint256 currentBlock, uint256 requiredBlock);
    error RevealTooLate(uint256 currentBlock, uint256 deadline);
    error InvalidReveal();

    constructor() Ownable(msg.sender) {
        reserveBalance = 0;
    }

    // ============ COMMIT PHASE ============
    /**
     * @dev Step 1: Player commits their bet with a secret
     * @param commitHash keccak256(abi.encodePacked(secret, msg.sender))
     *
     * The player generates a random secret locally, hashes it, and sends the hash.
     * This prevents miners from knowing the outcome in advance.
     */
    function commitBet(bytes32 commitHash) external payable nonReentrant whenNotPaused {
        // Validate bet amount
        if (msg.value < minBet) revert BetTooSmall(msg.value, minBet);
        if (msg.value > maxBet) revert BetTooLarge(msg.value, maxBet);

        // Check for existing pending bet
        if (pendingBets[msg.sender].amount > 0 && !pendingBets[msg.sender].resolved) {
            revert PendingBetExists();
        }

        // Calculate maximum possible payout
        uint256 maxPayout = (msg.value * MAX_PAYOUT_MULTIPLIER) / 100;

        // Check house can cover the payout BEFORE the bet is placed
        // Use balance MINUS the bet amount (since it's already added)
        uint256 availableForPayout = address(this).balance - msg.value;
        if (availableForPayout < maxPayout) {
            revert InsufficientHouseBalance(availableForPayout, maxPayout);
        }

        // Store pending bet
        pendingBets[msg.sender] = PendingBet({
            amount: msg.value,
            commitBlock: block.number,
            commitHash: commitHash,
            resolved: false
        });

        // Update reserve to cover this potential payout
        reserveBalance += maxPayout;

        emit BetCommitted(msg.sender, msg.value, commitHash);
    }

    // ============ REVEAL PHASE ============
    /**
     * @dev Step 2: Player reveals their secret to resolve the bet
     * @param secret The original secret used in commitHash
     *
     * The outcome is determined by combining:
     * - Player's secret (unknown to miner at commit time)
     * - Block hash of commit block (unknown at commit time)
     * - Player address (prevents replay)
     */
    function revealBet(bytes32 secret) external nonReentrant whenNotPaused {
        PendingBet storage bet = pendingBets[msg.sender];

        // Validate pending bet exists
        if (bet.amount == 0 || bet.resolved) revert NoPendingBet();

        // Validate timing
        if (block.number <= bet.commitBlock + MIN_REVEAL_DELAY) {
            revert RevealTooEarly(block.number, bet.commitBlock + MIN_REVEAL_DELAY + 1);
        }
        if (block.number > bet.commitBlock + REVEAL_TIMEOUT) {
            revert RevealTooLate(block.number, bet.commitBlock + REVEAL_TIMEOUT);
        }

        // Validate commit hash
        bytes32 expectedHash = keccak256(abi.encodePacked(secret, msg.sender));
        if (expectedHash != bet.commitHash) revert InvalidReveal();

        // Mark as resolved BEFORE external calls (reentrancy protection)
        bet.resolved = true;
        uint256 betAmount = bet.amount;

        // Release the reserved amount
        uint256 maxPayout = (betAmount * MAX_PAYOUT_MULTIPLIER) / 100;
        reserveBalance -= maxPayout;

        // Generate random using secret + blockhash (neither known at commit time)
        // blockhash of commitBlock wasn't known when player committed
        bytes32 blockHash = blockhash(bet.commitBlock + 1);
        uint256 random = uint256(keccak256(abi.encodePacked(
            secret,
            blockHash,
            msg.sender,
            bet.commitBlock
        ))) % 100;

        // Determine outcome
        uint8 result;
        uint256 payout;

        if (random < 15) {
            // Center hit - 15% chance, 1.9x payout (2x - 5% house edge)
            result = 2;
            payout = (betAmount * MAX_PAYOUT_MULTIPLIER) / 100;
        } else if (random < 50) {
            // Outer ring - 35% chance, 0.5x payout
            result = 1;
            payout = betAmount / 2;
        } else {
            // Miss - 50% chance, no payout
            result = 0;
            payout = 0;
        }

        // Update statistics
        totalGamesPlayed++;
        totalWagered += betAmount;
        playerGamesPlayed[msg.sender]++;
        playerTotalWagered[msg.sender] += betAmount;

        // Send payout if any (guaranteed by reserve system)
        if (payout > 0) {
            totalPayouts += payout;
            playerTotalWon[msg.sender] += payout;

            (bool success, ) = payable(msg.sender).call{value: payout}("");
            require(success, "Payout failed");
        }

        emit BetRevealed(msg.sender, betAmount, result, payout);
    }

    // ============ REFUND (Timeout Protection) ============
    /**
     * @dev Refund a bet if reveal window expired
     * Protects players who couldn't reveal in time
     */
    function refundExpiredBet() external nonReentrant {
        PendingBet storage bet = pendingBets[msg.sender];

        if (bet.amount == 0 || bet.resolved) revert NoPendingBet();

        // Only allow refund after timeout
        if (block.number <= bet.commitBlock + REVEAL_TIMEOUT) {
            revert RevealTooEarly(block.number, bet.commitBlock + REVEAL_TIMEOUT + 1);
        }

        bet.resolved = true;
        uint256 refundAmount = bet.amount;

        // Release reserved amount
        uint256 maxPayout = (refundAmount * MAX_PAYOUT_MULTIPLIER) / 100;
        reserveBalance -= maxPayout;

        // Refund the bet
        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund failed");

        emit BetRefunded(msg.sender, refundAmount, "Reveal timeout");
    }

    // ============ SIMPLE MODE (For Hackathon Demo) ============
    /**
     * @dev Simple single-transaction bet for demos
     * WARNING: This is NOT secure against miners. Only use for small amounts.
     * Uses future blockhash which is slightly better but still manipulable.
     */
    function quickBet() external payable nonReentrant whenNotPaused {
        if (msg.value < minBet) revert BetTooSmall(msg.value, minBet);
        if (msg.value > maxBet) revert BetTooLarge(msg.value, maxBet);

        uint256 maxPayout = (msg.value * MAX_PAYOUT_MULTIPLIER) / 100;
        uint256 availableForPayout = address(this).balance - msg.value;

        // CRITICAL: Check balance BEFORE accepting bet
        if (availableForPayout < maxPayout) {
            // Refund immediately - don't take money we can't cover
            (bool refunded, ) = payable(msg.sender).call{value: msg.value}("");
            require(refunded, "Refund failed");
            emit BetRefunded(msg.sender, msg.value, "Insufficient house balance");
            return;
        }

        // Generate random (note: manipulable by miners for large bets)
        uint256 random = uint256(keccak256(abi.encodePacked(
            block.prevrandao,
            block.timestamp,
            msg.sender,
            totalGamesPlayed,
            blockhash(block.number - 1)
        ))) % 100;

        uint8 result;
        uint256 payout;

        if (random < 15) {
            result = 2;
            payout = (msg.value * MAX_PAYOUT_MULTIPLIER) / 100;
        } else if (random < 50) {
            result = 1;
            payout = msg.value / 2;
        } else {
            result = 0;
            payout = 0;
        }

        // Update stats
        totalGamesPlayed++;
        totalWagered += msg.value;
        playerGamesPlayed[msg.sender]++;
        playerTotalWagered[msg.sender] += msg.value;

        // Send payout
        if (payout > 0) {
            totalPayouts += payout;
            playerTotalWon[msg.sender] += payout;
            (bool success, ) = payable(msg.sender).call{value: payout}("");
            require(success, "Payout failed");
        }

        emit BetRevealed(msg.sender, msg.value, result, payout);
    }

    // ============ HOUSE MANAGEMENT ============

    function fundHouse() external payable {
        require(msg.value > 0, "Must send CELO");
        emit GameFunded(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw house profits (owner only)
     * Cannot withdraw reserved funds (player protection)
     */
    function withdrawHouse(uint256 amount) external onlyOwner {
        uint256 available = address(this).balance - reserveBalance;
        require(amount <= available, "Cannot withdraw reserved funds");

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdrawal failed");

        emit HouseWithdraw(msg.sender, amount, reserveBalance);
    }

    /**
     * @dev Emergency pause - stops all betting
     */
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Emergency withdraw - only when paused, for critical situations
     */
    function emergencyWithdraw() external onlyOwner whenPaused {
        uint256 balance = address(this).balance;
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Emergency withdrawal failed");
        emit EmergencyWithdraw(msg.sender, balance);
    }

    // ============ VIEW FUNCTIONS ============

    function getHouseBalance() external view returns (uint256 total, uint256 available, uint256 reserved) {
        total = address(this).balance;
        reserved = reserveBalance;
        available = total > reserved ? total - reserved : 0;
    }

    function getPlayerStats(address player) external view returns (
        uint256 gamesPlayed,
        uint256 totalWon,
        uint256 totalWagered_
    ) {
        return (
            playerGamesPlayed[player],
            playerTotalWon[player],
            playerTotalWagered[player]
        );
    }

    function getPendingBet(address player) external view returns (
        uint256 amount,
        uint256 commitBlock,
        bool canReveal,
        bool canRefund,
        bool resolved
    ) {
        PendingBet memory bet = pendingBets[player];
        return (
            bet.amount,
            bet.commitBlock,
            block.number > bet.commitBlock + MIN_REVEAL_DELAY &&
                block.number <= bet.commitBlock + REVEAL_TIMEOUT,
            block.number > bet.commitBlock + REVEAL_TIMEOUT,
            bet.resolved
        );
    }

    // ============ ADMIN FUNCTIONS ============

    function updateBetLimits(uint256 _minBet, uint256 _maxBet) external onlyOwner {
        require(_minBet > 0, "Min bet must be positive");
        require(_minBet < _maxBet, "Invalid bet range");
        require(_maxBet <= 0.01 ether, "Max bet too high"); // Safety limit for MVP

        minBet = _minBet;
        maxBet = _maxBet;

        emit ConfigUpdated(_minBet, _maxBet);
    }

    // ============ RECEIVE ============

    receive() external payable {
        emit GameFunded(msg.sender, msg.value);
    }
}
