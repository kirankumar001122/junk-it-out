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
    if (hasRazorpay()) {
      resolve(true);
      return;
    }

    const finish = (loaded: boolean) => {
      if (!loaded) razorpayScriptPromise = null;
      resolve(loaded);
    };

    const existing = document.getElementById(
      RAZORPAY_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existing) {
      if (hasRazorpay() || existing.getAttribute('data-loaded') === 'true') {
        finish(true);
        return;
      }
      if (existing.getAttribute('data-failed') === 'true') {
        existing.remove();
      } else {
        existing.addEventListener('load', () => {
          existing.setAttribute('data-loaded', 'true');
          finish(hasRazorpay());
        }, {
          once: true,
        });
        existing.addEventListener('error', () => {
          existing.setAttribute('data-failed', 'true');
          finish(false);
        }, { once: true });
        // Failsafe timeout to prevent hanging promise on already-executed scripts
        setTimeout(() => {
          finish(hasRazorpay());
        }, 3000);
        return;
      }
    }

    const script = document.createElement('script');
    script.id = RAZORPAY_SCRIPT_ID;
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      script.setAttribute('data-loaded', 'true');
      finish(hasRazorpay());
    };
    script.onerror = () => {
      script.setAttribute('data-failed', 'true');
      finish(false);
    };
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

export function preloadRazorpayScript(): void {
  if (typeof window !== 'undefined') {
    loadRazorpayScript().catch(() => {});
  }
}
