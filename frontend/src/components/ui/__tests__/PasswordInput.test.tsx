import React, { useRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PasswordInput } from '../PasswordInput';

describe('PasswordInput Component', () => {
  it('renders input with type="password" and closed eye toggle by default', () => {
    render(
      <label>
        Mật khẩu
        <PasswordInput id="pwd" placeholder="Nhập mật khẩu" />
      </label>
    );

    const input = screen.getByPlaceholderText('Nhập mật khẩu') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('password');

    const toggleBtn = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles to type="text" on click and back to type="password" on second click', () => {
    render(<PasswordInput id="pwd" placeholder="Nhập mật khẩu" />);

    const input = screen.getByPlaceholderText('Nhập mật khẩu') as HTMLInputElement;
    const toggleBtn = screen.getByRole('button', { name: 'Hiện mật khẩu' });

    // Click to show password
    fireEvent.click(toggleBtn);
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Click again to hide password
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(input.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Hiện mật khẩu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hiện mật khẩu' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('preserves input value when toggling show/hide', () => {
    const handleChange = vi.fn();
    const TestForm: React.FC = () => {
      const [val, setVal] = React.useState('MySecret123!');
      return (
        <PasswordInput
          id="pwd"
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            handleChange(e.target.value);
          }}
          placeholder="Mật khẩu"
        />
      );
    };

    render(<TestForm />);

    const input = screen.getByPlaceholderText('Mật khẩu') as HTMLInputElement;
    expect(input.value).toBe('MySecret123!');

    // Toggle to visible
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input.value).toBe('MySecret123!');
    expect(input.type).toBe('text');

    // Type additional character
    fireEvent.change(input, { target: { value: 'MySecret123!_Extra' } });
    expect(input.value).toBe('MySecret123!_Extra');

    // Toggle to hidden
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(input.value).toBe('MySecret123!_Extra');
    expect(input.type).toBe('password');
  });

  it('prevents default on mousedown to preserve input focus', () => {
    render(<PasswordInput id="pwd" placeholder="Nhập mật khẩu" />);

    const toggleBtn = screen.getByRole('button', { name: 'Hiện mật khẩu' });
    const event = new MouseEvent('mousedown', { cancelable: true, bubbles: true });
    toggleBtn.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('manages independent visibility state for multiple password inputs', () => {
    render(
      <div>
        <label htmlFor="old-pwd">Mật khẩu cũ</label>
        <PasswordInput id="old-pwd" placeholder="Mật khẩu cũ" />

        <label htmlFor="new-pwd">Mật khẩu mới</label>
        <PasswordInput id="new-pwd" placeholder="Mật khẩu mới" />

        <label htmlFor="confirm-pwd">Xác nhận mật khẩu</label>
        <PasswordInput id="confirm-pwd" placeholder="Xác nhận mật khẩu" />
      </div>
    );

    const oldInput = screen.getByPlaceholderText('Mật khẩu cũ') as HTMLInputElement;
    const newInput = screen.getByPlaceholderText('Mật khẩu mới') as HTMLInputElement;
    const confirmInput = screen.getByPlaceholderText('Xác nhận mật khẩu') as HTMLInputElement;

    const toggleButtons = screen.getAllByRole('button', { name: 'Hiện mật khẩu' });
    expect(toggleButtons).toHaveLength(3);

    // Toggle ONLY the second input (Mật khẩu mới)
    fireEvent.click(toggleButtons[1]);

    expect(oldInput.type).toBe('password');
    expect(newInput.type).toBe('text');
    expect(confirmInput.type).toBe('password');

    // Toggle the third input (Xác nhận mật khẩu)
    const remainingHideButtons = screen.getAllByRole('button', { name: 'Hiện mật khẩu' });
    expect(remainingHideButtons).toHaveLength(2);
    fireEvent.click(remainingHideButtons[1]); // confirm-pwd

    expect(oldInput.type).toBe('password');
    expect(newInput.type).toBe('text');
    expect(confirmInput.type).toBe('text');
  });

  it('forwards ref to the underlying HTMLInputElement', () => {
    const TestComponent: React.FC = () => {
      const inputRef = useRef<HTMLInputElement>(null);
      return (
        <div>
          <PasswordInput ref={inputRef} id="ref-pwd" placeholder="Ref input" />
          <button onClick={() => inputRef.current?.focus()}>Focus input</button>
        </div>
      );
    };

    render(<TestComponent />);
    const input = screen.getByPlaceholderText('Ref input');
    fireEvent.click(screen.getByText('Focus input'));
    expect(document.activeElement).toBe(input);
  });

  it('disables toggle button when input is disabled', () => {
    render(<PasswordInput id="pwd" placeholder="Disabled pwd" disabled />);

    const input = screen.getByPlaceholderText('Disabled pwd') as HTMLInputElement;
    const toggleBtn = screen.getByRole('button', { name: 'Hiện mật khẩu' }) as HTMLButtonElement;

    expect(input.disabled).toBe(true);
    expect(toggleBtn.disabled).toBe(true);
  });
});
