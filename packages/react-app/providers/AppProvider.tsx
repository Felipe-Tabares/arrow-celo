"use client";

import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { celo } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";

import Layout from "../components/Layout";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";

// Create connectors - prioritize Farcaster wallet in miniapp environment
const connectors = [
  farcasterMiniApp(), // Farcaster wallet (first priority when in miniapp)
  walletConnect({ projectId, showQrModal: true }), // WalletConnect for multi-wallet support
  injected({ target: "metaMask" }), // MetaMask specifically
];

// Celo Sepolia testnet (chain ID 11142220)
export const celoSepolia = defineChain({
  id: 11_142_220,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] },
  },
  blockExplorers: {
    default: { name: "Celoscan", url: "https://sepolia.celoscan.io" },
  },
  testnet: true,
});

const config = createConfig({
  connectors,
  chains: [celoSepolia, celo],
  transports: {
    [celoSepolia.id]: http("https://forno.celo-sepolia.celo-testnet.org"),
    [celo.id]: http("https://forno.celo.org"),
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
