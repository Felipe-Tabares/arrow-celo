"use client";

import { useWeb3 } from "@/contexts/useWeb3";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useConnect, useDisconnect } from "wagmi";

let sdk: any = null;

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected, celoBalance, needsChainSwitch, ensureCorrectChain } = useWeb3();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [isFarcasterMiniapp, setIsFarcasterMiniapp] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const initFarcasterSDK = async () => {
      try {
        const url = new URL(window.location.href);
        const isMiniApp =
          url.searchParams.get("miniApp") === "true" ||
          window.navigator.userAgent.includes("Farcaster") ||
          window.navigator.userAgent.includes("Warpcast") ||
          window.parent !== window ||
          !!(window as any).farcaster;

        setIsFarcasterMiniapp(isMiniApp);

        if (isMiniApp) {
          const { sdk: farcasterSDK } = await import("@farcaster/miniapp-sdk");
          sdk = farcasterSDK;
          sdk.actions.ready();
        }
        setIsInitializing(false);
      } catch (error) {
        setIsInitializing(false);
      }
    };
    initFarcasterSDK();
  }, []);

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num === 0) return "0.00";
    return num.toFixed(4);
  };

  if (!mounted) {
    return <div className="min-h-screen bg-[#0a0a0f]" />;
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
            <div className="absolute inset-2 rounded-full border-4 border-amber-500/40" />
            <div className="absolute inset-4 rounded-full border-4 border-amber-500/60" />
            <div className="absolute inset-6 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Not connected - Landing page
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          {/* Animated Target Logo */}
          <div className="relative w-32 h-32 mb-6">
            <div className="absolute inset-0 rounded-full border-[3px] border-red-500/30 animate-pulse" />
            <div className="absolute inset-3 rounded-full border-[3px] border-red-500/50" />
            <div className="absolute inset-6 rounded-full border-[3px] border-red-500/70" />
            <div className="absolute inset-9 rounded-full border-[3px] border-amber-500/80" />
            <div className="absolute inset-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/30" />
            {/* Arrow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl animate-bounce">
              🎯
            </div>
          </div>

          <h1 className="text-4xl font-black text-white tracking-tight mb-2">
            ARROW
          </h1>
          <p className="text-amber-500 font-semibold text-lg mb-1">
            Shoot • Hit • Win
          </p>
          <p className="text-gray-500 text-sm mb-8">
            On-chain betting on Celo
          </p>

          {/* Payout Info Cards */}
          <div className="w-full max-w-xs mb-8">
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-4 border border-gray-700/50">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-green-500/10 rounded-xl p-3 border border-green-500/20">
                  <div className="text-2xl mb-1">🎯</div>
                  <div className="text-green-400 font-bold text-lg">1.9x</div>
                  <div className="text-gray-500 text-xs">Bullseye</div>
                </div>
                <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
                  <div className="text-2xl mb-1">⭕</div>
                  <div className="text-amber-400 font-bold text-lg">0.5x</div>
                  <div className="text-gray-500 text-xs">Ring</div>
                </div>
                <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20">
                  <div className="text-2xl mb-1">💨</div>
                  <div className="text-red-400 font-bold text-lg">0x</div>
                  <div className="text-gray-500 text-xs">Miss</div>
                </div>
              </div>
            </div>
          </div>

          {/* Connect Buttons */}
          <div className="w-full max-w-xs space-y-3">
            {!isFarcasterMiniapp ? (
              <>
                {connectors.filter(c => c.id !== 'farcasterMiniApp').map((connector) => (
                  <button
                    key={connector.id}
                    onClick={() => connect({ connector })}
                    className="w-full py-4 px-6 rounded-2xl font-bold text-lg transition-all duration-200 active:scale-[0.98] bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40"
                  >
                    Connect {connector.name === 'WalletConnect' ? 'Wallet' : connector.name}
                  </button>
                ))}
              </>
            ) : (
              <button
                onClick={() => {
                  const fc = connectors.find(c => c.id === 'farcasterMiniApp');
                  if (fc) connect({ connector: fc });
                }}
                className="w-full py-4 px-6 rounded-2xl font-bold text-lg transition-all duration-200 active:scale-[0.98] bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-500/25"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 text-center">
          <p className="text-gray-600 text-xs">
            Built on Celo • Farcaster Mini App
          </p>
        </div>
      </div>
    );
  }

  // Connected - Game Menu
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-800/50" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <span className="text-sm">🎯</span>
          </div>
          <span className="font-bold text-white">ARROW</span>
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">Balance</p>
          <p className="text-white font-mono font-bold">{formatBalance(celoBalance)} <span className="text-amber-500">CELO</span></p>
        </div>
      </div>

      {/* Chain Warning */}
      {needsChainSwitch && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <p className="text-amber-200 text-sm font-medium">Switch to Celo Network</p>
            <button
              onClick={ensureCorrectChain}
              className="px-4 py-1.5 bg-amber-500 text-black text-sm font-bold rounded-lg"
            >
              Switch
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Target Animation */}
        <div className="relative w-40 h-40 mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-red-500/20" />
          <div className="absolute inset-4 rounded-full border-4 border-red-500/40" />
          <div className="absolute inset-8 rounded-full border-4 border-red-500/60" />
          <div className="absolute inset-12 rounded-full border-4 border-amber-500/80" />
          <div className="absolute inset-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-lg shadow-amber-500/50" />
          {/* Pulsing glow */}
          <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Ready to Play?</h2>
        <p className="text-gray-400 text-center mb-8 max-w-[250px]">
          Bet micro amounts of CELO and test your luck!
        </p>

        {/* Play Button */}
        <Link href="/game" className="w-full max-w-xs">
          <button className="w-full py-5 px-6 rounded-2xl font-bold text-xl transition-all duration-200 active:scale-[0.98] bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40 flex items-center justify-center gap-3">
            <span className="text-2xl">🏹</span>
            Play Now
          </button>
        </Link>

        {/* Game Info */}
        <div className="w-full max-w-xs mt-8">
          <div className="bg-gray-900/50 rounded-2xl p-4 border border-gray-800">
            <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-3">How It Works</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-sm">1</div>
                <p className="text-gray-300 text-sm">Choose your bet (0.0005 - 0.005 CELO)</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-sm">2</div>
                <p className="text-gray-300 text-sm">Shoot your arrow at the target</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-sm">3</div>
                <p className="text-gray-300 text-sm">Hit the bullseye, win 1.9x!</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-gray-800/50" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <p className="text-gray-600 text-xs font-mono">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </p>
        <button
          onClick={() => disconnect()}
          className="text-gray-500 text-xs hover:text-red-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}
