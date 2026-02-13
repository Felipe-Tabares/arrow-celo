import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ArrowGameModule = buildModule("ArrowGameModule", (m) => {
  // Using the secure version for production
  const arrowGame = m.contract("ArrowGameSecure");

  return { arrowGame };
});

export default ArrowGameModule;
