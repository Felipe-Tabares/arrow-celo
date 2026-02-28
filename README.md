# Arrow - On-chain Archery Game

An on-chain archery betting game built on Celo Sepolia testnet. Draw your bow, shoot your arrow, and let the blockchain decide your fate.

## How It Works

1. **Connect wallet** - MetaMask or WalletConnect
2. **Choose your bet** - 0.0005 to 0.005 CELO
3. **Draw & shoot** - Hold to draw the bow, release to shoot
4. **On-chain result** - The smart contract determines if you hit:
   - **Bullseye** (1.9x payout)
   - **Outer Ring** (0.5x return)
   - **Miss** (0x - lost bet)

All outcomes are determined on-chain. The arrow animation plays while the transaction confirms, then the real result is revealed.

## Live Demo

**App:** [arrow-celo-react-app.vercel.app](https://arrow-celo-react-app.vercel.app)

**Contract:** [`0x7811742fD0271A7861778E3D8AAF4BC583751f4F`](https://celo-sepolia.celoscan.io/address/0x7811742fD0271A7861778E3D8AAF4BC583751f4F) on Celo Sepolia

## Tech Stack

- **Smart Contract:** Solidity 0.8.24, OpenZeppelin (Ownable, ReentrancyGuard, Pausable)
- **Frontend:** Next.js 15, React 18, Tailwind CSS
- **Blockchain:** wagmi v2, viem, Celo Sepolia testnet
- **Deployment:** Hardhat Ignition, Vercel

## Project Structure

```
packages/
  hardhat/          # Smart contract, deployment scripts
    contracts/      # ArrowGameSecure.sol
    ignition/       # Deployment modules
  react-app/        # Next.js frontend
    app/            # Pages (home + game)
    contexts/       # Web3 hooks, ABI
    providers/      # Wagmi + QueryClient
```

## Getting Started

```bash
# Install dependencies
npm install

# Start local frontend
cd packages/react-app
cp .env.template .env.local  # Fill in values
npm run dev

# Deploy contract
cd packages/hardhat
cp .env.template .env  # Add private key
npm run deploy:testnet
```

## Contract Security

- `tx.origin` check blocks contract-based attacks on `quickBet`
- ReentrancyGuard on all state-changing functions
- Pausable with emergency withdrawal
- Reserve balance system to protect player funds
- Bet limits (0.0005 - 0.005 CELO) for MVP safety

## Network

Currently deployed on **Celo Sepolia testnet** only. No real funds are at risk.

---

Built on [Celo](https://celo.org) with [Celo Composer](https://github.com/celo-org/celo-composer).
