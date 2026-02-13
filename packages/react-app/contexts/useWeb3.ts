import { formatEther, parseEther } from "viem";
import { celo } from "viem/chains";
import {
  useAccount,
  useBalance,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import StableTokenABI from "./cusd-abi.json";

// Using Celo Mainnet for hackathon
const cUSDTokenAddress = "0x765de816845861e75a25fca122bb6898b8b1282a"; // Mainnet cUSD
const CELO_TOKEN_ADDRESS = "0x471EcE3750Da237f93B8E339c536989b8978a438"; // Mainnet CELO

export const useWeb3 = () => {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  const { writeContract: writeCUSD, data: cUSDTxHash } = useWriteContract();

  const { isLoading: isCUSDLoading } = useWaitForTransactionReceipt({
    hash: cUSDTxHash,
  });

  // Check if we need to switch chains - now using Celo Mainnet
  const needsChainSwitch = chain?.id !== celo.id;

  // Get native CELO balance
  const { data: celoBalance, refetch: refetchCeloBalance } = useBalance({
    address: address,
    query: {
      enabled: !!address,
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  });

  // Get cUSD balance (using testnet address)
  const { data: cUSDBalance, refetch: refetchCUSDBalance } = useReadContract({
    address: cUSDTokenAddress,
    abi: StableTokenABI.abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  });

  const sendCUSD = async (to: string, amount: string) => {
    if (needsChainSwitch) {
      await switchChain({ chainId: celo.id });
    }

    const amountInWei = parseEther(amount);

    const result = await writeCUSD({
      address: cUSDTokenAddress,
      abi: StableTokenABI.abi,
      functionName: "transfer",
      args: [to, amountInWei],
    });

    // Refetch balances after transaction
    setTimeout(() => {
      refetchCeloBalance();
      refetchCUSDBalance();
    }, 2000);

    return result;
  };

  const ensureCorrectChain = async () => {
    if (needsChainSwitch) {
      await switchChain({ chainId: celo.id });
    }
  };

  // Format balances for display
  const formattedCeloBalance = celoBalance
    ? formatEther(celoBalance.value)
    : "0";
  const formattedCUSDBalance = cUSDBalance
    ? formatEther(cUSDBalance as bigint)
    : "0";

  return {
    // Account info
    address,
    isConnected,
    chain,
    needsChainSwitch,

    // Balances
    celoBalance: formattedCeloBalance,
    cUSDBalance: formattedCUSDBalance,

    // Actions
    sendCUSD,
    ensureCorrectChain,

    // Loading states
    isCUSDLoading,

    // Transaction hashes
    cUSDTxHash,
  };
};
