"use client";

import { useWeb3 } from "@/contexts/useWeb3";
import { useEffect, useState, useRef, useMemo } from "react";
import { parseEther, formatEther, decodeEventLog } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import Link from "next/link";
import ArrowGameABI from "@/contexts/arrow-game-abi.json";

const ARROW_GAME_ADDRESS = (process.env.NEXT_PUBLIC_ARROW_GAME_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`;
const IS_CONTRACT_DEPLOYED = ARROW_GAME_ADDRESS !== "0x0000000000000000000000000000000000000000";

type GameResult = {
  result: number;
  payout: string;
  betAmount: string;
} | null;

type GameState = "idle" | "drawing" | "flying" | "result";

type ArrowLandingData = {
  x: number;  // -50 to 50 (percentage from center)
  y: number;  // -50 to 50 (percentage from center)
  zone: "bullseye" | "inner" | "outer" | "miss" | "short" | "overshoot";
};

type ArrowLanding = ArrowLandingData | null;

const POWER_ZONES = {
  TOO_WEAK: { min: 0, max: 25 },
  VALID_LOW: { min: 25, max: 40 },
  SWEET_SPOT: { min: 40, max: 60 },
  VALID_HIGH: { min: 60, max: 75 },
  TOO_STRONG: { min: 75, max: 100 },
};

export default function GamePage() {
  const { address, isConnected, celoBalance, needsChainSwitch, ensureCorrectChain, refetchCeloBalance } = useWeb3();

  const [betAmount, setBetAmount] = useState("0.001");
  const [lastResult, setLastResult] = useState<GameResult>(null);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [power, setPower] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [arrowY, setArrowY] = useState(0);
  const [shotPower, setShotPower] = useState(0);
  const [shake, setShake] = useState(0);
  const [bowPull, setBowPull] = useState(0);
  const [arrowLanding, setArrowLanding] = useState<ArrowLanding>(null);
  const [showArrowOnTarget, setShowArrowOnTarget] = useState(false);

  const powerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "signing" | "confirming">("idle");

  // Shot history for the session
  const [shotHistory, setShotHistory] = useState<Array<{
    result: number; // 0=miss, 1=ring, 2=bullseye
    betAmount: string;
    payout: string;
    timestamp: number;
  }>>([]);

  // Deterministic grass patches (avoids hydration mismatch from Math.random in render)
  const grassPatches = useMemo(() => {
    const seed = (n: number) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: 20 }, (_, i) => ({
      width: 10 + seed(i * 4) * 30,
      height: 5 + seed(i * 4 + 1) * 10,
      left: seed(i * 4 + 2) * 100,
      top: seed(i * 4 + 3) * 100,
    }));
  }, []);

  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // Generate random landing position within a zone
  const generateLandingPosition = (result: number): ArrowLanding => {
    const angle = Math.random() * Math.PI * 2; // Random angle
    let distance: number;
    let zone: ArrowLandingData["zone"];

    if (result === 2) {
      // Bullseye - within center 15%
      distance = Math.random() * 8;
      zone = "bullseye";
    } else if (result === 1) {
      // Outer ring - between 15% and 45%
      distance = 10 + Math.random() * 30;
      zone = Math.random() > 0.5 ? "inner" : "outer";
    } else {
      // Miss - hit the edge or barely on target
      distance = 40 + Math.random() * 15;
      zone = "miss";
    }

    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      zone
    };
  };

  // Calculate shot outcome with randomness based on power
  const calculateShotOutcome = (power: number): { reachesTarget: boolean; result: number; landing: ArrowLanding } => {
    // Base randomness - add variance to power
    const variance = (Math.random() - 0.5) * 20; // ±10% variance
    const effectivePower = power + variance;

    // Check if reaches target
    if (effectivePower < 20) {
      return {
        reachesTarget: false,
        result: -1,
        landing: { x: 0, y: 30 + Math.random() * 20, zone: "short" }
      };
    }
    if (effectivePower > 80) {
      return {
        reachesTarget: false,
        result: -1,
        landing: { x: (Math.random() - 0.5) * 40, y: -60, zone: "overshoot" }
      };
    }

    // Reaches target - calculate accuracy based on power zone
    const inSweetSpot = power >= POWER_ZONES.SWEET_SPOT.min && power <= POWER_ZONES.SWEET_SPOT.max;
    const inValidLow = power >= POWER_ZONES.VALID_LOW.min && power < POWER_ZONES.SWEET_SPOT.min;
    const inValidHigh = power > POWER_ZONES.SWEET_SPOT.max && power <= POWER_ZONES.VALID_HIGH.max;

    // Accuracy affects the "spread" of where arrow lands
    let accuracyMultiplier: number;
    if (inSweetSpot) {
      accuracyMultiplier = 0.6; // Tighter spread, more likely center
    } else if (inValidLow || inValidHigh) {
      accuracyMultiplier = 1.0; // Normal spread
    } else {
      accuracyMultiplier = 1.5; // Wide spread, edges
    }

    // Random distance from center (affected by accuracy)
    const baseDistance = Math.random() * 50 * accuracyMultiplier;
    const angle = Math.random() * Math.PI * 2;

    // Determine result based on distance
    let result: number;
    let zone: ArrowLandingData["zone"];

    if (baseDistance < 12) {
      result = 2; // Bullseye
      zone = "bullseye";
    } else if (baseDistance < 35) {
      result = 1; // Ring
      zone = baseDistance < 22 ? "inner" : "outer";
    } else {
      result = 0; // Miss (edge of target)
      zone = "miss";
    }

    return {
      reachesTarget: true,
      result,
      landing: {
        x: Math.cos(angle) * Math.min(baseDistance, 48),
        y: Math.sin(angle) * Math.min(baseDistance, 48),
        zone
      }
    };
  };

  // Power increases while holding
  useEffect(() => {
    if (isHolding && gameState === "drawing") {
      powerIntervalRef.current = setInterval(() => {
        setPower(prev => {
          const newPower = Math.min(prev + 1.2, 100);
          setBowPull(Math.min(newPower, 80));
          if (newPower > 70) {
            setShake(Math.random() * (newPower - 70) * 0.15);
          }
          return newPower;
        });
      }, 30);
    } else {
      if (powerIntervalRef.current) clearInterval(powerIntervalRef.current);
      setShake(0);
    }
    return () => {
      if (powerIntervalRef.current) clearInterval(powerIntervalRef.current);
    };
  }, [isHolding, gameState]);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (gameState !== "idle" || txStatus !== "idle") return;
    setErrorMsg(null);
    setIsHolding(true);
    setGameState("drawing");
    setPower(0);
    setBowPull(0);
    setLastResult(null);
    setArrowLanding(null);
    setShowArrowOnTarget(false);
    setArrowY(0);
  };

  const handleRelease = () => {
    if (!isHolding || gameState !== "drawing") return;
    setIsHolding(false);
    setShotPower(power);

    // Calculate outcome with randomness
    const outcome = calculateShotOutcome(power);
    setArrowLanding(outcome.landing);

    animateArrow(power, outcome);
  };

  const animateArrow = (
    shotPower: number,
    outcome: { reachesTarget: boolean; result: number; landing: ArrowLanding }
  ) => {
    setGameState("flying");
    setBowPull(0);

    const maxTravel = outcome.reachesTarget ? 100 :
                      outcome.landing?.zone === "short" ? 30 + (shotPower / 25) * 35 : 115;

    let progress = 0;
    const animate = () => {
      progress += 0.03;
      const easeOut = 1 - Math.pow(1 - Math.min(progress, 1), 3);
      setArrowY(easeOut * maxTravel);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Arrow landed
        setShowArrowOnTarget(outcome.reachesTarget);

        setTimeout(() => {
          if (outcome.reachesTarget) {
            executeBet(outcome.result);
          } else {
            setLastResult(null);
            setGameState("result");
          }
        }, 300);
      }
    };
    requestAnimationFrame(animate);
  };

  const executeBet = async (preCalculatedResult: number) => {
    if (!address) return;

    // Validate balance
    if (IS_CONTRACT_DEPLOYED && parseFloat(celoBalance) < parseFloat(betAmount)) {
      setErrorMsg("Insufficient CELO balance");
      setGameState("idle");
      setTimeout(() => setErrorMsg(null), 5000);
      return;
    }

    if (!IS_CONTRACT_DEPLOYED) {
      // Demo mode
      setTimeout(() => {
        const multiplier = preCalculatedResult === 2 ? 1.9 : preCalculatedResult === 1 ? 0.5 : 0;
        const payout = (parseFloat(betAmount) * multiplier).toFixed(6);
        const landing = generateLandingPosition(preCalculatedResult);
        setArrowLanding(landing);
        setShowArrowOnTarget(true);
        setLastResult({ result: preCalculatedResult, payout, betAmount });
        setGameState("result");
      }, 200);
      return;
    }

    try {
      await ensureCorrectChain();

      // Step 1: Send tx (user signs in wallet)
      setTxStatus("signing");
      const hash = await writeContractAsync({
        address: ARROW_GAME_ADDRESS,
        abi: ArrowGameABI.abi,
        functionName: "quickBet",
        value: parseEther(betAmount),
      });

      // Step 2: Wait for on-chain confirmation
      setTxStatus("confirming");
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });

      // Step 3: Parse events from receipt
      setTxStatus("idle");

      // Helper to refetch balance now + again after delay (RPC lag)
      const refreshBalance = () => {
        refetchCeloBalance?.();
        setTimeout(() => refetchCeloBalance?.(), 2000);
      };

      // Check if tx reverted on-chain
      if (receipt.status === "reverted") {
        setErrorMsg("Transaction reverted on-chain. Try again.");
        setGameState("idle");
        refreshBalance();
        setTimeout(() => setErrorMsg(null), 5000);
        return;
      }

      let foundBetRevealed = false;
      let foundBetRefunded = false;

      for (const log of receipt.logs) {
        // Only decode logs from the game contract
        if (log.address.toLowerCase() !== ARROW_GAME_ADDRESS.toLowerCase()) continue;

        try {
          const decoded = decodeEventLog({
            abi: ArrowGameABI.abi,
            data: log.data,
            topics: log.topics,
            strict: false,
          });
          if (decoded.eventName === "BetRevealed") {
            foundBetRevealed = true;
            const args = decoded.args as any;
            const result = Number(args.result);
            const payout = formatEther(args.payout);
            const amount = formatEther(args.amount);
            const landing = generateLandingPosition(result);
            setArrowLanding(landing);
            setShowArrowOnTarget(true);
            setLastResult({ result, payout, betAmount: amount });
            setGameState("result");
            setShotHistory(prev => [{ result, betAmount: amount, payout, timestamp: Date.now() }, ...prev]);
            refreshBalance();
            return;
          } else if (decoded.eventName === "BetRefunded") {
            foundBetRefunded = true;
          }
        } catch {
          // Log from game contract but not a known event - skip
        }
      }

      if (foundBetRefunded) {
        setErrorMsg("House balance too low. Try a smaller bet.");
      } else {
        setErrorMsg("Transaction completed but no result found. Try again.");
      }
      setGameState("idle");
      refreshBalance();
      setTimeout(() => setErrorMsg(null), 5000);
    } catch (error: any) {
      setTxStatus("idle");
      refetchCeloBalance?.();
      setTimeout(() => refetchCeloBalance?.(), 2000);
      const msg = error?.message || "";
      if (msg.includes("User rejected") || msg.includes("denied")) {
        setErrorMsg("Transaction cancelled");
      } else if (msg.includes("BetTooSmall")) {
        setErrorMsg("Bet is below minimum (0.0005 CELO)");
      } else if (msg.includes("BetTooLarge")) {
        setErrorMsg("Bet exceeds maximum (0.005 CELO)");
      } else if (msg.includes("InsufficientHouseBalance")) {
        setErrorMsg("House has insufficient funds");
      } else {
        setErrorMsg("Transaction failed. Try again.");
      }
      setGameState("idle");
      setTimeout(() => setErrorMsg(null), 5000);
    }
  };

  const playAgain = () => {
    setGameState("idle");
    setLastResult(null);
    setErrorMsg(null);
    setTxStatus("idle");
    setPower(0);
    setShotPower(0);
    setArrowLanding(null);
    setShowArrowOnTarget(false);
    setArrowY(0);
    setBowPull(0);
  };

  const getPowerColor = (p: number) => {
    if (p < POWER_ZONES.TOO_WEAK.max) return "#ef4444";
    if (p < POWER_ZONES.VALID_LOW.max) return "#eab308";
    if (p < POWER_ZONES.SWEET_SPOT.max) return "#22c55e";
    if (p < POWER_ZONES.VALID_HIGH.max) return "#eab308";
    return "#ef4444";
  };

  const formatBalance = (balance: string) => parseFloat(balance).toFixed(4);
  const betOptions = ["0.0005", "0.001", "0.002", "0.005"];

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-gray-400 mb-4">Connect wallet to play</p>
          <Link href="/">
            <button className="px-6 py-3 bg-amber-500 text-black font-bold rounded-xl">Go Back</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col select-none">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between border-b border-gray-800/50" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <Link href="/" className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-bold text-white">ARROW</span>
        </Link>
        <div className="text-right">
          <p className="text-gray-500 text-[10px] uppercase tracking-wider">Balance</p>
          <p className="text-white font-mono font-bold text-sm">{formatBalance(celoBalance)} <span className="text-amber-500">CELO</span></p>
        </div>
      </div>

      {!IS_CONTRACT_DEPLOYED && (
        <div className="mx-4 mt-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-amber-300 text-xs text-center">Demo Mode</p>
        </div>
      )}

      {errorMsg && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40">
          <p className="text-red-300 text-xs text-center">{errorMsg}</p>
        </div>
      )}

      {txStatus !== "idle" && (
        <div className="mx-4 mt-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <p className="text-blue-300 text-xs text-center animate-pulse">
            {txStatus === "signing" ? "Confirm in your wallet..." : "Confirming on-chain..."}
          </p>
        </div>
      )}

      {/* Game Area */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #87CEEB 0%, #B0C4DE 20%, #4a6741 50%, #3d5a35 100%)",
          touchAction: "none"
        }}
      >
        {/* Sky gradient overlay */}
        <div
          className="absolute inset-x-0 top-0 h-[45%] pointer-events-none"
          style={{
            background: "linear-gradient(180deg, #4a7a9e 0%, #6b9dbd 30%, #87CEEB 60%, transparent 100%)"
          }}
        />

        {/* Subtle clouds */}
        <div className="absolute inset-x-0 top-0 h-[30%] pointer-events-none overflow-hidden opacity-40">
          <div
            className="absolute"
            style={{
              top: "10%",
              left: "10%",
              width: "80px",
              height: "30px",
              background: "radial-gradient(ellipse, rgba(255,255,255,0.8) 0%, transparent 70%)",
              borderRadius: "50%"
            }}
          />
          <div
            className="absolute"
            style={{
              top: "15%",
              right: "15%",
              width: "100px",
              height: "35px",
              background: "radial-gradient(ellipse, rgba(255,255,255,0.6) 0%, transparent 70%)",
              borderRadius: "50%"
            }}
          />
          <div
            className="absolute"
            style={{
              top: "5%",
              left: "40%",
              width: "60px",
              height: "25px",
              background: "radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, transparent 70%)",
              borderRadius: "50%"
            }}
          />
        </div>

        {/* Horizon line glow */}
        <div
          className="absolute inset-x-0 pointer-events-none"
          style={{
            top: "42%",
            height: "8%",
            background: "linear-gradient(180deg, transparent 0%, rgba(255,255,200,0.15) 50%, transparent 100%)"
          }}
        />

        {/* Vignette effect for depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)"
          }}
        />

        {/* Grass ground with perspective */}
        <div className="absolute inset-x-0 bottom-0 h-[55%] overflow-hidden">
          {/* Base grass color */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(180deg, #4a7c39 0%, #3d6b2e 30%, #2d5022 70%, #1a3614 100%)"
            }}
          />

          {/* Grass texture lines for depth */}
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0"
              style={{
                top: `${i * 8}%`,
                height: "2px",
                background: `linear-gradient(90deg, transparent 0%, rgba(60,90,40,${0.3 - i * 0.02}) 20%, rgba(60,90,40,${0.4 - i * 0.02}) 50%, rgba(60,90,40,${0.3 - i * 0.02}) 80%, transparent 100%)`,
                transform: `scaleX(${1 + i * 0.15})`
              }}
            />
          ))}

          {/* Grass patches for texture (deterministic to avoid hydration mismatch) */}
          <div className="absolute inset-0 opacity-30">
            {grassPatches.map((patch, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${patch.width}px`,
                  height: `${patch.height}px`,
                  left: `${patch.left}%`,
                  top: `${patch.top}%`,
                  background: `radial-gradient(ellipse, rgba(80,120,50,0.5) 0%, transparent 70%)`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Distance markers on grass */}
        <div className="absolute inset-x-0 bottom-[20%] h-[35%] pointer-events-none">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                top: `${i * 20}%`,
                width: `${100 - i * 15}%`,
                height: "1px",
                background: `linear-gradient(90deg, transparent 0%, rgba(0,0,0,${0.1 + i * 0.03}) 30%, rgba(0,0,0,${0.15 + i * 0.03}) 50%, rgba(0,0,0,${0.1 + i * 0.03}) 70%, transparent 100%)`,
              }}
            />
          ))}
        </div>

        {/* Target - SMALL and on the grass (far away) */}
        <div
          className="absolute left-1/2"
          style={{
            top: "38%",
            transform: "translateX(-50%)",
            filter: "drop-shadow(2px 3px 2px rgba(0,0,0,0.4))"
          }}
        >
          {/* Target shadow on grass */}
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: "-8px",
              width: "50px",
              height: "10px",
              background: "radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%)",
            }}
          />

          <div className="relative">
            {/* Target SVG - SMALL (far away) */}
            <svg width="70" height="70" viewBox="0 0 140 140">
              {/* Background */}
              <circle cx="70" cy="70" r="68" fill="#1a1a1a" stroke="#333" strokeWidth="3"/>
              {/* Rings */}
              <circle cx="70" cy="70" r="60" fill="#dc2626"/>
              <circle cx="70" cy="70" r="48" fill="#fafafa"/>
              <circle cx="70" cy="70" r="36" fill="#dc2626"/>
              <circle cx="70" cy="70" r="24" fill="#fafafa"/>
              <circle cx="70" cy="70" r="12" fill="#fbbf24"/>
              <circle cx="70" cy="70" r="5" fill="#000"/>

              {/* Arrow stuck in target */}
              {showArrowOnTarget && arrowLanding && arrowLanding.zone !== "short" && arrowLanding.zone !== "overshoot" && (
                <g transform={`translate(${70 + arrowLanding.x * 0.8}, ${70 + arrowLanding.y * 0.8})`}>
                  {/* Arrow shaft (shorter for small target) */}
                  <rect x="-3" y="-20" width="6" height="24" fill="#8B7355" rx="2"/>
                  {/* Fletching */}
                  <polygon points="-5,0 0,-10 -3,4" fill="#dc2626"/>
                  <polygon points="5,0 0,-10 3,4" fill="#dc2626"/>
                  {/* Impact */}
                  <circle cx="0" cy="5" r="4" fill="#333" opacity="0.5"/>
                </g>
              )}
            </svg>

            {/* Glow effect on hit */}
            {showArrowOnTarget && arrowLanding && gameState === "result" && lastResult && (
              <div
                className="absolute w-3 h-3 rounded-full animate-ping"
                style={{
                  left: `${35 + (arrowLanding.x * 0.4)}px`,
                  top: `${35 + (arrowLanding.y * 0.4)}px`,
                  transform: "translate(-50%, -50%)",
                  backgroundColor: lastResult.result === 2 ? "#22c55e" :
                                   lastResult.result === 1 ? "#eab308" : "#ef4444"
                }}
              />
            )}
          </div>

          {/* Target stand - short (perspective) */}
          <div className="relative mx-auto">
            <div
              className="w-2 h-8 mx-auto"
              style={{
                background: "linear-gradient(90deg, #4a3010 0%, #8b6914 50%, #4a3010 100%)"
              }}
            />
            {/* Base on grass */}
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2"
              style={{
                width: "16px",
                height: "5px",
                background: "#3d2a15",
                borderRadius: "50%",
              }}
            />
          </div>
        </div>

        {/* Arrow in flight - shrinks as it flies away */}
        {gameState === "flying" && (
          <div
            className="absolute left-1/2 transition-none pointer-events-none"
            style={{
              bottom: `calc(22% + ${arrowY * 0.45}%)`,
              transform: `translateX(-50%) scale(${1 - arrowY * 0.005})`,
            }}
          >
            <svg width="40" height="80" viewBox="0 0 32 64">
              <rect x="14" y="16" width="4" height="44" fill="#8B7355" rx="1"/>
              <polygon points="16,0 10,16 16,12 22,16" fill="#4a5568"/>
              <polygon points="12,56 16,46 14,60" fill="#dc2626"/>
              <polygon points="20,56 16,46 18,60" fill="#dc2626"/>
            </svg>
          </div>
        )}

        {/* Missed arrow - fell short (on the grass) */}
        {gameState === "result" && arrowLanding?.zone === "short" && (
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{ top: "52%" }}
          >
            {/* Arrow stuck in grass at angle */}
            <svg width="24" height="48" viewBox="0 0 32 64" style={{ transform: "rotate(25deg)" }}>
              <rect x="14" y="16" width="4" height="44" fill="#8B7355" rx="1"/>
              <polygon points="16,0 10,16 16,12 22,16" fill="#4a5568"/>
              <polygon points="12,56 16,46 14,60" fill="#dc2626"/>
              <polygon points="20,56 16,46 18,60" fill="#dc2626"/>
            </svg>
            {/* Shadow */}
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2"
              style={{
                width: "30px",
                height: "8px",
                background: "radial-gradient(ellipse, rgba(0,0,0,0.3) 0%, transparent 70%)",
              }}
            />
          </div>
        )}

        {/* Missed arrow - overshot (past target) */}
        {gameState === "result" && arrowLanding?.zone === "overshoot" && (
          <div
            className="absolute left-1/2 -translate-x-1/2"
            style={{ top: "28%" }}
          >
            <svg width="16" height="32" viewBox="0 0 32 64" style={{ transform: "rotate(-10deg) scale(0.5)" }}>
              <rect x="14" y="16" width="4" height="44" fill="#8B7355" rx="1"/>
              <polygon points="16,0 10,16 16,12 22,16" fill="#4a5568"/>
              <polygon points="12,56 16,46 14,60" fill="#dc2626"/>
              <polygon points="20,56 16,46 18,60" fill="#dc2626"/>
            </svg>
          </div>
        )}

        {/* Bow shadow on ground - LARGE */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: "5%",
            width: "280px",
            height: "40px",
            background: "radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 70%)",
            transform: "translateX(-50%)"
          }}
        />

        {/* Bow at bottom - LARGE (close to viewer) */}
        <div
          className="absolute bottom-[8%] left-1/2"
          style={{
            transform: `translateX(-50%) translateX(${shake}px)`,
            filter: "drop-shadow(3px 6px 4px rgba(0,0,0,0.4))"
          }}
        >
          <svg width="300" height="150" viewBox="0 0 200 100">
            {/* Bow limbs */}
            <path
              d={`M 15 50 Q 100 ${95 - bowPull * 0.35} 185 50`}
              fill="none"
              stroke="url(#bowWood)"
              strokeWidth="10"
              strokeLinecap="round"
            />
            {/* Bow tips */}
            <circle cx="15" cy="50" r="4" fill="#5c3d1e"/>
            <circle cx="185" cy="50" r="4" fill="#5c3d1e"/>
            {/* Bow string */}
            <path
              d={`M 15 50 Q 100 ${50 + bowPull * 0.6} 185 50`}
              fill="none"
              stroke="#d4b896"
              strokeWidth="2.5"
            />
            {/* Arrow on bow */}
            {(gameState === "idle" || gameState === "drawing") && (
              <g style={{ transform: `translateY(${bowPull * 0.5}px)` }}>
                {/* Arrow shaft */}
                <rect x="94" y="5" width="12" height="50" fill="#8B7355" rx="3"/>
                {/* Arrow head pointing UP */}
                <polygon points="100,-8 88,12 100,5 112,12" fill="#4a5568"/>
                {/* Fletching */}
                <polygon points="91,50 100,38 94,58" fill="#dc2626"/>
                <polygon points="109,50 100,38 106,58" fill="#dc2626"/>
                <polygon points="100,52 100,38 100,60" fill="#fbbf24"/>
              </g>
            )}
            {/* Grip/Handle */}
            <ellipse cx="100" cy="50" rx="16" ry="10" fill="#5c4033"/>
            <ellipse cx="100" cy="50" rx="12" ry="7" fill="#4a3525"/>
            <defs>
              <linearGradient id="bowWood" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6b3d1a"/>
                <stop offset="25%" stopColor="#8B4513"/>
                <stop offset="50%" stopColor="#A0522D"/>
                <stop offset="75%" stopColor="#8B4513"/>
                <stop offset="100%" stopColor="#6b3d1a"/>
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Touch areas */}
        {gameState === "idle" && (
          <div
            className="absolute bottom-0 left-0 right-0 h-[40%] cursor-pointer"
            onMouseDown={handleStart}
            onTouchStart={handleStart}
          />
        )}
        {gameState === "drawing" && (
          <div
            className="absolute inset-0"
            onMouseUp={handleRelease}
            onMouseLeave={handleRelease}
            onTouchEnd={handleRelease}
          />
        )}

        {/* Power Meter */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <div className="relative h-48 w-6 bg-gray-900 rounded-full border border-gray-700 overflow-hidden">
            <div className="absolute inset-1 rounded-full overflow-hidden">
              <div className="absolute bottom-0 w-full h-[25%] bg-red-900/40"/>
              <div className="absolute bottom-[25%] w-full h-[15%] bg-yellow-900/40"/>
              <div className="absolute bottom-[40%] w-full h-[20%] bg-green-900/40"/>
              <div className="absolute bottom-[60%] w-full h-[15%] bg-yellow-900/40"/>
              <div className="absolute bottom-[75%] w-full h-[25%] bg-red-900/40"/>
            </div>
            <div
              className="absolute bottom-1 left-1 right-1 rounded-full transition-all duration-75"
              style={{
                height: `calc(${power}% - 8px)`,
                backgroundColor: getPowerColor(power)
              }}
            />
            <div className="absolute left-0 right-0 bottom-[40%] h-[20%] border-y border-green-400/50"/>
          </div>
          {gameState === "drawing" && (
            <p className="text-center mt-2 text-sm font-bold" style={{ color: getPowerColor(power) }}>
              {Math.round(power)}%
            </p>
          )}
        </div>

        {/* Instructions */}
        {gameState === "idle" && (
          <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2">
            <p className="text-white/70 text-sm animate-pulse drop-shadow-lg">Tap & hold to draw</p>
          </div>
        )}
        {gameState === "drawing" && (
          <div className="absolute bottom-[18%] left-1/2 -translate-x-1/2">
            <p className="text-amber-300 text-sm font-bold drop-shadow-lg">Release to shoot!</p>
          </div>
        )}

        {/* Result overlay - Target hit */}
        {gameState === "result" && lastResult && arrowLanding && arrowLanding.zone !== "short" && arrowLanding.zone !== "overshoot" && (
          <div className="absolute inset-x-0 bottom-[15%] flex justify-center z-20">
            <div className={`text-center p-5 rounded-2xl backdrop-blur-sm mx-4 ${
              lastResult.result === 2 ? "bg-green-500/20 border border-green-500" :
              lastResult.result === 1 ? "bg-amber-500/20 border border-amber-500" :
              "bg-red-500/20 border border-red-500"
            }`}>
              <div className="text-4xl mb-2">
                {lastResult.result === 2 ? "🎯" : lastResult.result === 1 ? "⭕" : "😔"}
              </div>
              <h2 className={`text-xl font-black mb-1 ${
                lastResult.result === 2 ? "text-green-400" :
                lastResult.result === 1 ? "text-amber-400" : "text-red-400"
              }`}>
                {lastResult.result === 2 ? "BULLSEYE!" : lastResult.result === 1 ? "OUTER RING!" : "MISSED!"}
              </h2>
              <p className={`text-sm ${lastResult.result > 0 ? "text-green-300 font-bold" : "text-gray-400"}`}>
                {lastResult.result > 0 ? `+${parseFloat(lastResult.payout).toFixed(4)} CELO` : `-${lastResult.betAmount} CELO`}
              </p>
              <div className="flex gap-2 mt-3 justify-center">
                <button
                  onClick={playAgain}
                  className="px-5 py-2 rounded-xl font-bold text-sm bg-amber-500 text-black"
                >
                  SHOOT AGAIN
                </button>
                <button
                  onClick={() => {
                    const won = lastResult && parseFloat(lastResult.payout) > 0;
                    const resultText = won
                      ? `I just hit ${lastResult!.result === 2 ? 'a BULLSEYE 🎯' : 'the ring ⭕'} and won ${parseFloat(lastResult!.payout).toFixed(4)} CELO on Arrow!`
                      : `I missed my shot on Arrow! 💨 Better luck next time.`;
                    const appUrl = typeof window !== "undefined" ? window.location.origin : "https://arrow-celo-react-app.vercel.app";
                    const tweet = `${resultText}\n\nPlay Arrow on Celo 🏹\n${appUrl}`;
                    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(tweet)}`, "_blank");
                  }}
                  className="px-4 py-2 rounded-xl font-bold text-sm bg-black text-white border border-gray-600"
                >
                  Post on 𝕏
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Result overlay - Missed target entirely */}
        {gameState === "result" && (arrowLanding?.zone === "short" || arrowLanding?.zone === "overshoot") && (
          <div className="absolute inset-x-0 bottom-[15%] flex justify-center z-20">
            <div className="text-center p-5 rounded-2xl backdrop-blur-sm mx-4 bg-gray-500/20 border border-gray-500">
              <div className="text-4xl mb-2">{arrowLanding?.zone === "short" ? "💨" : "💥"}</div>
              <h2 className="text-xl font-black mb-1 text-gray-300">
                {arrowLanding?.zone === "short" ? "TOO WEAK!" : "TOO STRONG!"}
              </h2>
              <p className="text-gray-400 text-sm">No bet placed</p>
              <p className="text-xs text-gray-500 mt-1">Power: {Math.round(shotPower)}%</p>
              <button
                onClick={playAgain}
                className="mt-3 px-5 py-2 rounded-xl font-bold text-sm bg-amber-500 text-black"
              >
                TRY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls - fixed height, never compresses game area */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-800/50 bg-[#0d1117]" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mb-3">
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-2 text-center">Bet Amount</p>
          <div className="flex gap-2 justify-center">
            {betOptions.map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount)}
                disabled={gameState !== "idle"}
                className={`px-3 py-2 rounded-lg text-sm font-bold transition-all ${
                  betAmount === amount
                    ? "bg-amber-500 text-black"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                } ${gameState !== "idle" ? "opacity-50" : ""}`}
              >
                {amount}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-gray-800/50 rounded-lg py-2">
            <p className="text-green-400 font-bold">🎯 1.9x</p>
            <p className="text-gray-600">Bullseye</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg py-2">
            <p className="text-amber-400 font-bold">⭕ 0.5x</p>
            <p className="text-gray-600">Ring</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg py-2">
            <p className="text-red-400 font-bold">💨 0x</p>
            <p className="text-gray-600">Miss</p>
          </div>
        </div>

        {/* Shot History - compact, last 5 only */}
        {shotHistory.length > 0 && (
          <div className="mt-2">
            <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1 text-center">Shot History</p>
            <div className="space-y-0.5">
              {shotHistory.slice(0, 5).map((shot, i) => {
                const won = parseFloat(shot.payout) > 0;
                const net = won
                  ? `+${parseFloat(shot.payout).toFixed(4)}`
                  : `-${parseFloat(shot.betAmount).toFixed(4)}`;
                return (
                  <div key={shot.timestamp + i} className="flex items-center justify-between bg-gray-800/40 rounded px-2 py-1 text-[11px]">
                    <span>{shot.result === 2 ? "🎯" : shot.result === 1 ? "⭕" : "💨"}</span>
                    <span className="text-gray-500">{parseFloat(shot.betAmount).toFixed(4)}</span>
                    <span className={`font-bold ${won ? "text-green-400" : "text-red-400"}`}>{net}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
