import { formatEther } from "viem";
import {
  useAccount,
  useBalance,
  useSwitchChain,
} from "wagmi";
import { celoSepolia } from "@/providers/AppProvider";

const TARGET_CHAIN_ID = celoSepolia.id; // Celo Sepolia testnet

export const useWeb3 = () => {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();

  // Check if we need to switch chains
  const needsChainSwitch = chain?.id !== TARGET_CHAIN_ID;

  // Get native CELO balance
  const { data: celoBalance, refetch: refetchCeloBalance } = useBalance({
    address: address,
    chainId: TARGET_CHAIN_ID,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  });

  const ensureCorrectChain = async () => {
    if (needsChainSwitch) {
      await switchChain({ chainId: TARGET_CHAIN_ID });
    }
  };

  // Format balance for display
  const formattedCeloBalance = celoBalance
    ? formatEther(celoBalance.value)
    : "0";

  return {
    address,
    isConnected,
    chain,
    needsChainSwitch,
    celoBalance: formattedCeloBalance,
    ensureCorrectChain,
    refetchCeloBalance,
  };
};
