import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import { config as dotEnvConfig } from 'dotenv';
import { HardhatUserConfig } from 'hardhat/config';

dotEnvConfig();

const config: HardhatUserConfig = {
  networks: {
    celoSepolia: {
      accounts: [process.env.PRIVATE_KEY ?? '0x0'],
      url: 'https://forno.celo-sepolia.celo-testnet.org',
      chainId: 11_142_220,
    },
    celo: {
      accounts: [process.env.PRIVATE_KEY ?? '0x0'],
      url: 'https://forno.celo.org',
      chainId: 42_220,
    },
  },
  etherscan: {
    apiKey: {
      celoSepolia: process.env.CELOSCAN_API_KEY ?? '',
      celo: process.env.CELOSCAN_API_KEY ?? '',
    },
    customChains: [
      {
        chainId: 11_142_220,
        network: 'celoSepolia',
        urls: {
          apiURL: 'https://api-sepolia.celoscan.io/api',
          browserURL: 'https://sepolia.celoscan.io',
        },
      },
      {
        chainId: 42_220,
        network: 'celo',
        urls: {
          apiURL: 'https://api.celoscan.io/api',
          browserURL: 'https://celoscan.io/',
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
  solidity: '0.8.24',
};

export default config;
