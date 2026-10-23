const RAZORPAY_SCRIPT_ID = 'razorpay-checkout-script';
const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let razorpayScriptPromise: Promise<boolean> | null = null;

function hasRazorpay(): boolean {
  return Boolean((window as Window & { Razorpay?: unknown }).Razorpay);
}

export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (hasRazorpay()) return Promise.resolve(true);
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    const existing = document.getElementById(
      RAZORPAY_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    const finish = (loaded: boolean) => {
      if (!loaded) razorpayScriptPromise = null;
      resolve(loaded);
    };

    if (existing) {
      existing.addEventListener('load', () => finish(hasRazorpay()), {
        once: true,
      });
      existing.addEventListener('error', () => finish(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = RAZORPAY_SCRIPT_ID;
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => finish(hasRazorpay());
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}
