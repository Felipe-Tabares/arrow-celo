import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // Get the host from headers (this works better with ngrok)
  const host = request.headers.get("host") || "localhost:3000";

  // Determine protocol - ngrok always uses https
  const protocol = host.includes("ngrok")
    ? "https"
    : request.headers.get("x-forwarded-proto") ||
      (host === "localhost:3000" ? "http" : "https");

  const baseUrl = `${protocol}://${host}`;

  const manifest = {
    miniapp: {
      version: "1",
      name: "Arrow",
      iconUrl: `${baseUrl}/logo.svg`,
      homeUrl: baseUrl,
      splashImageUrl: `${baseUrl}/logo.svg`,
      splashBackgroundColor: "#0a0a0f",
      subtitle: "Shoot, Hit, Win on Celo",
      description:
        "On-chain archery betting game on Celo blockchain. Aim, shoot, and win up to 1.9x your bet!",
      primaryCategory: "games",
      tags: ["games", "betting", "celo", "blockchain", "archery"],
      ogTitle: "Arrow - On-chain Archery Game",
      ogDescription:
        "Bet micro amounts of CELO and test your aim! Hit the bullseye for 1.9x payout.",
      ogImageUrl: `${baseUrl}/logo.svg`,
      requiredChains: [
        "eip155:44787", // Celo Alfajores Testnet
        "eip155:42220", // Celo Mainnet
      ],
      requiredCapabilities: ["wallet.getEthereumProvider"],
    },
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
