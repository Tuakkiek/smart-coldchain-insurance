import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateShipmentModal } from '../CreateShipmentModal';
import { ToastProvider } from '../../feedback/Toast';
import * as shipmentsApi from '../../../api/shipments';
import * as locationsApi from '../../../api/locations';
import {
  validateBuyerWalletAddress,
  validateSepoliaEthAmount,
} from '../../../utils/ethereum';
import { parseGoogleMapsLocally } from '../../../utils/googleMaps';
import { getAddress } from 'ethers';
import { ShipmentOut } from '../../../types/api';

vi.mock('../../../api/shipments', () => ({
  createShipment: vi.fn(),
}));

vi.mock('../../../api/locations', () => ({
  resolveLocationInput: vi.fn(),
}));

const BUYER_LOWER = '0x1234567890abcdef1234567890abcdef12345678';
const BUYER_CHECKSUM = getAddress(BUYER_LOWER);

function renderModal(onSuccess = vi.fn(), onClose = vi.fn()) {
  return render(
    <ToastProvider>
      <CreateShipmentModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    </ToastProvider>
  );
}

describe('Ethereum & Google Maps utilities', () => {
  it('converts SepoliaETH accurately to Wei without float precision loss', () => {
    expect(validateSepoliaEthAmount('0.05')).toMatchObject({
      valid: true,
      weiString: '50000000000000000',
    });
    expect(validateSepoliaEthAmount('0.000000000000000001')).toMatchObject({
      valid: true,
      weiString: '1',
    });
    expect(validateSepoliaEthAmount('0.0000000000000000001').valid).toBe(false);
    expect(validateSepoliaEthAmount('-0.05').valid).toBe(false);
    expect(validateSepoliaEthAmount('0').valid).toBe(false);
    expect(validateSepoliaEthAmount('abc').valid).toBe(false);
  });

  it('validates Ethereum addresses and EIP-55 checksums strictly', () => {
    expect(validateBuyerWalletAddress(BUYER_LOWER)).toMatchObject({
      status: 'valid',
      checksumAddress: BUYER_CHECKSUM,
    });
    expect(validateBuyerWalletAddress('0x1234').status).toBe('invalid');
    expect(validateBuyerWalletAddress('1234567890abcdef1234567890abcdef12345678').status).toBe('invalid');
    expect(validateBuyerWalletAddress('0x' + 'z'.repeat(40)).status).toBe('invalid');
    expect(validateBuyerWalletAddress('').status).toBe('empty');
  });

  it('extracts coordinates locally from Google Maps @lat,lng, !3d!4d, and ?q=lat,lng URLs', () => {
    const at = parseGoogleMapsLocally(
      'https://www.google.com/maps/place/Kho+Ha+Noi/@21.0285,105.8542,17z'
    );
    expect(at).toMatchObject({ latitude: 21.0285, longitude: 105.8542, label: 'Kho Ha Noi' });

    const pin = parseGoogleMapsLocally(
      'https://www.google.com/maps/place/CDC+Da+Nang/@16.0600,108.2100,15z/data=!8m2!3d16.0544!4d108.2022'
    );
    expect(pin).toMatchObject({ latitude: 16.0544, longitude: 108.2022, label: 'CDC Da Nang' });

    const q = parseGoogleMapsLocally('https://maps.google.com/?q=10.7769,106.7009');
    expect(q).toMatchObject({ latitude: 10.7769, longitude: 106.7009 });

    // Short links delegate to Backend
    expect(parseGoogleMapsLocally('https://maps.app.goo.gl/xyz123')).toBeNull();
  });
});

describe('CreateShipmentModal upgraded workflow', () => {
  const originalEthereum = window.ethereum;

  beforeEach(() => {
    vi.clearAllMocks();
    delete window.ethereum;
  });

  afterEach(() => {
    window.ethereum = originalEthereum;
  });

  it('hides manual coordinate inputs and resolves Google Maps URL for Origin and Backend short link for Destination independently', async () => {
    vi.mocked(locationsApi.resolveLocationInput).mockResolvedValue({
      success: true,
      data: {
        address: 'Bệnh viện Bạch Mai, Hà Nội',
        formatted_address: '78 Giải Phóng, Đống Đa, Hà Nội, Việt Nam',
        latitude: 21.0024,
        longitude: 105.8407,
        place_id: 'ChIJ_bach_mai',
        source: 'google_maps_geocoding',
      },
    });

    renderModal();

    // Verify manual Latitude/Longitude inputs are completely removed
    expect(screen.queryByLabelText(/Vĩ độ/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Kinh độ/i)).not.toBeInTheDocument();

    const originAddr = screen.getByLabelText(/Link Google Maps hoặc địa chỉ xuất phát/i) as HTMLInputElement;
    const destAddr = screen.getByLabelText(/Link Google Maps hoặc địa chỉ điểm đến/i) as HTMLInputElement;

    // Paste Google Maps URL with coordinates into Origin
    fireEvent.change(originAddr, {
      target: { value: 'https://www.google.com/maps/place/Kho+Moi/@10.7769,106.7009,17z' },
    });
    fireEvent.click(screen.getByTestId('resolve-origin-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('resolved-summary-origin')).toHaveTextContent('10.7769, 106.7009');
    });
    expect(screen.queryByTestId('resolved-summary-destination')).not.toBeInTheDocument();

    // Resolve short link on Destination via Backend
    fireEvent.change(destAddr, {
      target: { value: 'https://maps.app.goo.gl/bachmai' },
    });
    fireEvent.click(screen.getByTestId('resolve-destination-btn'));

    await waitFor(() => {
      expect(locationsApi.resolveLocationInput).toHaveBeenCalledWith('https://maps.app.goo.gl/bachmai');
      expect(screen.getByTestId('resolved-summary-destination')).toHaveTextContent('21.0024, 105.8407');
    });
    // Origin still preserved independently!
    expect(screen.getByTestId('resolved-summary-origin')).toHaveTextContent('10.7769, 106.7009');
  });

  it('auto-resolves Origin & Destination on submit, validates SepoliaETH and Buyer Wallet, and submits exact payload', async () => {
    const fakeCreated = { id: 'ship-1', code: 'SHIP-NEW-1' } as ShipmentOut;
    vi.mocked(shipmentsApi.createShipment).mockResolvedValue(fakeCreated);
    vi.mocked(locationsApi.resolveLocationInput).mockImplementation(async (input: string) => {
      if (input.includes('Hà Nội')) {
        return {
          success: true,
          data: {
            address: 'Kho Trung Ương 1, Hà Nội',
            formatted_address: 'Kho Trung Ương 1, Hoàn Kiếm, Hà Nội',
            latitude: 21.0285,
            longitude: 105.8542,
            place_id: 'place_hn',
            source: 'google_maps_geocoding',
          },
        };
      }
      return {
        success: true,
        data: {
          address: 'CDC Đà Nẵng',
          formatted_address: 'Trung Tâm Tiêm Chủng CDC, Đà Nẵng',
          latitude: 16.0544,
          longitude: 108.2022,
          place_id: 'place_dn',
          source: 'google_maps_geocoding',
        },
      };
    });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    renderModal(onSuccess, onClose);

    const submitBtn = screen.getByRole('button', { name: /Tạo Lô Hàng Mới/i }) as HTMLButtonElement;
    // Initially disabled because Origin, Destination, and Buyer Wallet are empty
    expect(submitBtn.disabled).toBe(true);
    expect(screen.getByText('Chưa nhập địa chỉ ví')).toBeInTheDocument();

    // Fill Origin & Destination as plain addresses (without manually clicking Nhận diện)
    fireEvent.change(screen.getByLabelText(/Link Google Maps hoặc địa chỉ xuất phát/i), {
      target: { value: 'Kho Trung Ương 1, Hà Nội' },
    });
    fireEvent.change(screen.getByLabelText(/Link Google Maps hoặc địa chỉ điểm đến/i), {
      target: { value: 'CDC Đà Nẵng' },
    });

    // Enter invalid ETH -> disabled
    const ethInput = screen.getByLabelText(/Số tiền bảo hiểm \(SepoliaETH\)/i);
    fireEvent.change(ethInput, { target: { value: '-0.5' } });

    const walletInput = screen.getByLabelText(/Địa chỉ ví người mua bảo hiểm/i);
    fireEvent.change(walletInput, { target: { value: '0x123' } });
    expect(screen.getByText('Địa chỉ ví không hợp lệ')).toBeInTheDocument();
    expect(submitBtn.disabled).toBe(true);

    // Fix ETH & valid wallet
    fireEvent.change(ethInput, { target: { value: '0.05' } });
    fireEvent.change(walletInput, { target: { value: BUYER_LOWER } });

    expect(screen.getByText('Địa chỉ ví hợp lệ')).toBeInTheDocument();
    // Must NOT claim MetaMask connected just because manual address was typed
    expect(screen.queryByText(/Đã kết nối MetaMask/i)).not.toBeInTheDocument();
    expect(screen.getByText(/50000000000000000 Wei/)).toBeInTheDocument();
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(shipmentsApi.createShipment).toHaveBeenCalledTimes(1);
    });

    const sentPayload = vi.mocked(shipmentsApi.createShipment).mock.calls[0][0];
    expect(sentPayload.origin).toEqual({
      name: 'Kho Trung Ương 1, Hoàn Kiếm, Hà Nội',
      formatted_address: 'Kho Trung Ương 1, Hoàn Kiếm, Hà Nội',
      place_id: 'place_hn',
      latitude: 21.0285,
      longitude: 105.8542,
    });
    expect(sentPayload.destination).toEqual({
      name: 'Trung Tâm Tiêm Chủng CDC, Đà Nẵng',
      formatted_address: 'Trung Tâm Tiêm Chủng CDC, Đà Nẵng',
      place_id: 'place_dn',
      latitude: 16.0544,
      longitude: 108.2022,
    });
    expect(sentPayload.insurance).toEqual({
      coverage_amount: '0.05',
      currency: 'SepoliaETH',
    });
    expect(sentPayload.buyer_wallet_address).toBe(BUYER_CHECKSUM);
    expect(onSuccess).toHaveBeenCalledWith(fakeCreated);
    expect(onClose).toHaveBeenCalled();
  });

  it('omits removed MetaMask and Sepolia network info banners from the modal', () => {
    renderModal();

    expect(screen.queryByText(/Kết nối MetaMask/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trạng thái ví MetaMask/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Chain ID: 11155111/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mạng Blockchain: Sepolia Testnet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hỗ trợ tối đa 18 chữ số thập phân/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Private Key hay Seed Phrase/i)).not.toBeInTheDocument();
  });
});
