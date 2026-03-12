import { useState, useRef } from 'react';

/**
 * Unified toast notification hook
 * Provides consistent toast notifications across all components
 */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  function showToast(message, isError = false) {
    // Clear existing toast timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setToast({ message, isError });

    // Auto-hide after 2 seconds
    timeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 2000);
  }

  function ToastContainer() {
    if (!toast) return null;

    return (
      <div className={`fixed top-4 left-4 right-4 px-4 py-3 rounded-lg shadow-lg text-sm z-50 ${
        toast.isError
          ? 'bg-red-50 text-red-800 border border-red-200'
          : 'bg-green-50 text-green-800 border border-green-200'
      }`}>
        {toast.message}
      </div>
    );
  }

  return { showToast, ToastContainer };
}
