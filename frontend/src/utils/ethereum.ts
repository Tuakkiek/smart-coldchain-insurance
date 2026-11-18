import { formatEther, getAddress, isAddress, parseEther } from 'ethers';
import { InsuranceOut } from '../types/api';

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7';
export const SEPOLIA_NETWORK_NAME = 'Sepolia Testnet';
export const SEPOLIA_CURRENCY = 'SepoliaETH';

const UINT256_MAX = (1n << 256n) - 1n;
const ETH_DECIMAL_REGEX = /^\d+(?:\.\d{1,18})?$/;
const ETH_TOO_MANY_DECIMALS_REGEX = /^\d+\.\d{19,}$/;
const HEX_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export interface EthValidationResult {
  valid: boolean;
  error: string | null;
  normalizedEth: string | null;
  weiString: string | null;
}

/**
 * Strictly validates a SepoliaETH coverage amount without using Number()/parseFloat().
 * Supports up to 18 decimal places, > 0, and <= uint256 max.
 */
export function validateSepoliaEthAmount(raw: string): EthValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Số tiền bảo hiểm (SepoliaETH) không được để trống',
      normalizedEth: null,
      weiString: null,
    };
  }
  if (trimmed.startsWith('-')) {
    return {
      valid: false,
      error: 'Số tiền bảo hiểm phải lớn hơn 0',
      normalizedEth: null,
      weiString: null,
    };
  }
  if (ETH_TOO_MANY_DECIMALS_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Chỉ hỗ trợ tối đa 18 chữ số thập phân',
      normalizedEth: null,
      weiString: null,
    };
  }
  if (!ETH_DECIMAL_REGEX.test(trimmed)) {
    return {
      valid: false,
      error: 'Giá trị SepoliaETH không hợp lệ (chỉ nhập số và dấu chấm thập phân)',
      normalizedEth: null,
      weiString: null,
    };
  }

  try {
    const wei = parseEther(trimmed);
    if (wei <= 0n) {
      return {
        valid: false,
        error: 'Số tiền bảo hiểm phải lớn hơn 0',
        normalizedEth: null,
        weiString: null,
      };
    }
    if (wei > UINT256_MAX) {
      return {
        valid: false,
        error: 'Số tiền vượt quá giới hạn uint256 của Smart Contract',
        normalizedEth: null,
        weiString: null,
      };
    }
    return {
      valid: true,
      error: null,
      normalizedEth: trimmed,
      weiString: wei.toString(),
    };
  } catch {
    return {
      valid: false,
      error: 'Không thể chuyển đổi giá trị SepoliaETH sang Wei',
      normalizedEth: null,
      weiString: null,
    };
  }
}

export type WalletValidationStatus = 'empty' | 'valid' | 'invalid';

export interface WalletValidationResult {
  status: WalletValidationStatus;
  checksumAddress: string | null;
  error: string | null;
}

/**
 * Validates an Ethereum wallet address using ethers v6 isAddress + getAddress (EIP-55).
 */
export function validateBuyerWalletAddress(raw: string): WalletValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      status: 'empty',
      checksumAddress: null,
      error: 'Vui lòng nhập địa chỉ ví người mua bảo hiểm',
    };
  }
  if (!trimmed.startsWith('0x')) {
    return {
      status: 'invalid',
      checksumAddress: null,
      error: 'Địa chỉ ví phải bắt đầu bằng 0x',
    };
  }
  if (trimmed.length !== 42) {
    return {
      status: 'invalid',
      checksumAddress: null,
      error: 'Địa chỉ ví phải gồm tiền tố 0x và đúng 40 ký tự hexadecimal',
    };
  }
  if (!HEX_ADDRESS_REGEX.test(trimmed)) {
    return {
      status: 'invalid',
      checksumAddress: null,
      error: 'Địa chỉ ví chứa ký tự không hợp lệ (chỉ cho phép 0-9, a-f, A-F)',
    };
  }
  if (!isAddress(trimmed)) {
    return {
      status: 'invalid',
      checksumAddress: null,
      error: 'Địa chỉ ví sai định dạng hoặc sai checksum EIP-55',
    };
  }

  try {
    return {
      status: 'valid',
      checksumAddress: getAddress(trimmed),
      error: null,
    };
  } catch {
    return {
      status: 'invalid',
      checksumAddress: null,
      error: 'Địa chỉ ví không hợp lệ',
    };
  }
}

export function shortenAddress(address: string, head = 6, tail = 4): string {
  if (!address || address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

export function formatWeiToEth(wei: string | null | undefined): string | null {
  if (!wei) return null;
  try {
    const formatted = formatEther(BigInt(wei));
    return formatted.includes('.') ? formatted.replace(/\.?0+$/, '') : formatted;
  } catch {
    return null;
  }
}

export function formatInsuranceCoverage(insurance: InsuranceOut): {
  primaryText: string;
  unitLabel: string;
  isEth: boolean;
  weiText: string | null;
} {
  if (insurance.currency === 'SepoliaETH' && insurance.coverage_amount) {
    return {
      primaryText: `${insurance.coverage_amount} SepoliaETH`,
      unitLabel: 'Sepolia Testnet (Chain ID: 11155111)',
      isEth: true,
      weiText: insurance.coverage_amount_wei || null,
    };
  }
  return {
    primaryText: `${(insurance.insured_amount_vnd ?? 0).toLocaleString('vi-VN')} VND`,
    unitLabel: 'Dữ liệu lịch sử VND (Local/Testnet Token — không phải tiền thật)',
    isEth: false,
    weiText: null,
  };
}

// ─── MetaMask / EIP-1193 Provider Helpers ─────────────────────────────────────

export interface Eip1193Provider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export interface MetaMaskState {
  available: boolean;
  connected: boolean;
  account: string | null;
  chainId: number | null;
  isSepolia: boolean;
}

export function parseChainId(rawChainId: unknown): number | null {
  if (typeof rawChainId === 'number' && Number.isInteger(rawChainId)) {
    return rawChainId;
  }
  if (typeof rawChainId === 'string') {
    const parsed = rawChainId.startsWith('0x')
      ? parseInt(rawChainId, 16)
      : parseInt(rawChainId, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function getEthereumProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  return window.ethereum ?? null;
}

export async function readMetaMaskState(): Promise<MetaMaskState> {
  const provider = getEthereumProvider();
  if (!provider) {
    return {
      available: false,
      connected: false,
      account: null,
      chainId: null,
      isSepolia: false,
    };
  }
  try {
    const [accountsRaw, chainIdRaw] = await Promise.all([
      provider.request({ method: 'eth_accounts' }),
      provider.request({ method: 'eth_chainId' }),
    ]);
    const accounts = Array.isArray(accountsRaw) ? accountsRaw : [];
    const first = typeof accounts[0] === 'string' && isAddress(accounts[0])
      ? getAddress(accounts[0])
      : null;
    const chainId = parseChainId(chainIdRaw);
    return {
      available: true,
      connected: Boolean(first),
      account: first,
      chainId,
      isSepolia: chainId === SEPOLIA_CHAIN_ID,
    };
  } catch {
    return {
      available: true,
      connected: false,
      account: null,
      chainId: null,
      isSepolia: false,
    };
  }
}

export async function connectMetaMaskWallet(): Promise<MetaMaskState> {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error('Không tìm thấy ví MetaMask trên trình duyệt. Vui lòng cài đặt MetaMask.');
  }
  const accountsRaw = await provider.request({ method: 'eth_requestAccounts' });
  const chainIdRaw = await provider.request({ method: 'eth_chainId' });
  const accounts = Array.isArray(accountsRaw) ? accountsRaw : [];
  const first = typeof accounts[0] === 'string' && isAddress(accounts[0])
    ? getAddress(accounts[0])
    : null;
  const chainId = parseChainId(chainIdRaw);
  return {
    available: true,
    connected: Boolean(first),
    account: first,
    chainId,
    isSepolia: chainId === SEPOLIA_CHAIN_ID,
  };
}

export async function switchMetaMaskToSepolia(): Promise<void> {
  const provider = getEthereumProvider();
  if (!provider) {
    throw new Error('Không tìm thấy ví MetaMask trên trình duyệt.');
  }
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: SEPOLIA_NETWORK_NAME,
            nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          },
        ],
      });
      return;
    }
    throw err;
  }
}

export function getNetworkNameByChainId(chainId: number | null): string {
  if (chainId === null) return 'Chưa xác định';
  switch (chainId) {
    case 1:
      return 'Ethereum Mainnet (Chain ID: 1)';
    case SEPOLIA_CHAIN_ID:
      return 'Sepolia Testnet (Chain ID: 11155111)';
    case 17000:
      return 'Holesky Testnet (Chain ID: 17000)';
    case 31337:
      return 'Hardhat Localnet (Chain ID: 31337)';
    default:
      return `Mạng khác (Chain ID: ${chainId})`;
  }
}
