"use client";

import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

import Layout from "../components/Layout";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";

// Create connectors - prioritize Farcaster wallet in miniapp environment
const connectors = [
  farcasterMiniApp(), // Farcaster wallet (first priority when in miniapp)
  walletConnect({ projectId, showQrModal: true }), // WalletConnect for multi-wallet support
  injected({ target: "metaMask" }), // MetaMask specifically
];

// Custom Alfajores config with working RPC
const alfajoresWithRpc = {
  ...celoAlfajores,
  rpcUrls: {
    default: {
      http: ["https://alfajores-forno.celo-testnet.org"],
    },
    public: {
      http: ["https://alfajores-forno.celo-testnet.org"],
    },
  },
};

const config = createConfig({
  connectors,
  chains: [celo, alfajoresWithRpc],
  transports: {
    [celo.id]: http("https://forno.celo.org"),
    [alfajoresWithRpc.id]: http("https://alfajores-forno.celo-testnet.org"),
  },
});

const queryClient = new QueryClient();

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <Layout>{children}</Layout>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
