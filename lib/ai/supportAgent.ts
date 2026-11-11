import { db } from '@/lib/db';
import { notifySupportEscalation } from '@/lib/ai/supportEscalation';
import { retrievePublicKnowledge } from '@/lib/ai/publicKnowledge';
import { logUnresolvedQuestion } from '@/lib/ai/unresolvedQueries';
import {
  calculatePickupSummary,
  SPECIAL_MATERIAL_THRESHOLD_KG,
  SPECIAL_MATERIAL_OFFER_PRICE,
  PICKUP_SERVICE_CHARGE,
  ORIGINAL_PICKUP_SERVICE_CHARGE,
} from '@/lib/pricing';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface SupportChatContext {
  userId?: string;
  customerId?: string;
  name?: string;
  phone?: string;
  role?: string;
}

// In-memory sliding window rate limiter (30 requests/minute per client IP/user)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export function checkSupportRateLimit(clientKey: string): {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
} {
  const now = Date.now();
  const record = rateLimitMap.get(clientKey);

  // Clean old entries periodically
  if (rateLimitMap.size > 2000) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (val.resetTime < now) rateLimitMap.delete(key);
    }
  }

  if (!record || record.resetTime < now) {
    rateLimitMap.set(clientKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetInSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - record.count,
    resetInSeconds: Math.ceil((record.resetTime - now) / 1000),
  };
}

/**
 * 1. LIVE PRICING & MATERIALS FROM DATABASE
 */
export async function getLiveMaterialsAndPricing() {
  try {
    const categories = await db.wasteCategory.findMany({
      where: { active: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        pricePerKg: true,
        minWeightKg: true,
        maxWeightKg: true,
        type: true,
      },
    });

    return {
      success: true,
      materials: categories.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        pricePerKg: c.pricePerKg,
        minWeightKg: c.minWeightKg,
        maxWeightKg: c.maxWeightKg,
        description: c.description,
        type: c.type,
      })),
      specialRules: {
        offerThresholdKg: SPECIAL_MATERIAL_THRESHOLD_KG,
        offerPrice: SPECIAL_MATERIAL_OFFER_PRICE,
        ruleDescription: `When quantity of an individual material exceeds ${SPECIAL_MATERIAL_THRESHOLD_KG} kg, a special flat rate of ₹${SPECIAL_MATERIAL_OFFER_PRICE} applies for that material.`,
        serviceCharge: PICKUP_SERVICE_CHARGE,
        originalServiceCharge: ORIGINAL_PICKUP_SERVICE_CHARGE,
        serviceChargeWaived: true,
        serviceChargeNotice: `Standard ₹${ORIGINAL_PICKUP_SERVICE_CHARGE} doorstep pickup charge is currently WAIVED (FREE / ₹0).`,
      },
    };
  } catch {
    return {
      success: false,
      error: 'Unable to retrieve live waste categories at this moment.',
      materials: [],
      specialRules: {
        offerThresholdKg: 7,
        offerPrice: 99,
        serviceCharge: 0,
        originalServiceCharge: 50,
        serviceChargeWaived: true,
      },
    };
  }
}

/**
 * 2. LIVE SERVICE AREAS FROM DATABASE
 * Junk It Out strictly serves ONLY TWO areas in Bengaluru:
 * 1. BTM Layout (1st & 2nd Stage)
 * 2. JP Nagar (Phases 1 to 9)
 * All other locations are not yet supported.
 */
export async function getLiveServiceAreas() {
  try {
    const areas = await db.serviceArea.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { name: { contains: 'BTM', mode: 'insensitive' } },
          { name: { contains: 'JP Nagar', mode: 'insensitive' } },
        ],
      },
      select: {
        name: true,
        city: true,
        etaMinutes: true,
        status: true,
      },
    });

    const primaryZones = ['JP Nagar (Phases 1 to 9)', 'BTM Layout (1st & 2nd Stage)'];
    const activeAreas =
      areas.length >= 2
        ? areas.map((a) => a.name)
        : Array.from(new Set([...areas.map((a) => a.name), ...primaryZones]));

    return {
      success: true,
      city: 'Bengaluru',
      supportedCount: 2,
      activeAreas,
      primaryZones,
      serviceNotice:
        'IMPORTANT: Junk It Out currently serves ONLY TWO locations: JP Nagar and BTM Layout in Bengaluru. All other locations (Whitefield, Koramangala, Indiranagar, Electronic City, HSR Layout, etc.) are strictly NOT supported.',
      serviceHours: '8:00 AM – 8:00 PM Daily',
      typicalEta: '20–30 Minutes for ASAP pickups',
    };
  } catch {
    return {
      success: true,
      city: 'Bengaluru',
      supportedCount: 2,
      activeAreas: ['JP Nagar (Phases 1 to 9)', 'BTM Layout (1st & 2nd Stage)'],
      primaryZones: ['JP Nagar (Phases 1 to 9)', 'BTM Layout (1st & 2nd Stage)'],
      serviceNotice:
        'IMPORTANT: Junk It Out currently serves ONLY TWO locations: JP Nagar and BTM Layout in Bengaluru. All other locations are strictly NOT supported.',
      serviceHours: '8:00 AM – 8:00 PM Daily',
      typicalEta: '20–30 Minutes',
    };
  }
}

/**
 * 3. AUTHORIZED CUSTOMER ORDERS RETRIEVAL
 * Strictly isolates data to the authenticated customer.
 */
export async function getAuthenticatedCustomerOrders(
  context: SupportChatContext,
  queryOrderNumber?: string
) {
  if (!context.customerId) {
    return {
      success: false,
      authenticated: false,
      message:
        'You need to be logged in to view your orders. Please log in with your phone number on our website.',
      orders: [],
    };
  }

  try {
    const whereClause: any = { customerId: context.customerId };
    if (queryOrderNumber) {
      whereClause.orderNumber = { contains: queryOrderNumber.trim(), mode: 'insensitive' };
    }

    const orders = await db.order.findMany({
      where: whereClause,
      include: {
        agent: {
          select: {
            vehicleType: true,
            user: { select: { name: true } },
          },
        },
        items: {
          include: {
            category: { select: { name: true, pricePerKg: true } },
          },
        },
        payments: {
          select: { id: true, amount: true, status: true, gateway: true, createdAt: true },
        },
        settlement: {
          select: { amount: true, status: true, utr: true },
        },
        address: {
          select: { area: true, city: true, formattedAddress: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      success: true,
      authenticated: true,
      orders: orders.map((o) => {
        return {
          orderNumber: o.orderNumber,
          status: o.status,
          pickupType: o.pickupType,
          scheduledSlot: o.scheduledSlot,
          finalAmount: o.finalAmount,
          estimatedTotal: o.estimatedTotal,
          pickupCharge: o.pickupCharge,
          paymentStatus: o.paymentStatus,
          createdAt: o.createdAt.toISOString(),
          area: o.address?.area || 'Bengaluru',
          agent: o.agent
            ? {
                name: o.agent.user.name,
                vehicleType: o.agent.vehicleType,
              }
            : null,
          items: o.items.map((i) => ({
            categoryName: i.category?.name || 'Waste Item',
            estimatedWeight: i.estimatedWeight,
            actualWeight: i.actualWeight,
            ratePerKg: i.ratePerKg,
            subtotal: i.subtotal,
          })),
          payments: o.payments.map((p) => ({
            amount: p.amount,
            status: p.status,
          })),
          settlement: o.settlement
            ? { amount: o.settlement.amount, status: o.settlement.status, utr: o.settlement.utr }
            : null,
        };
      }),
    };
  } catch {
    return {
      success: false,
      authenticated: true,
      message: 'Failed to retrieve orders from database.',
      orders: [],
    };
  }
}

/**
 * 4. AUTHORIZED CUSTOMER WALLET & TRANSACTIONS RETRIEVAL
 */
export async function getAuthenticatedCustomerWallet(context: SupportChatContext) {
  if (!context.customerId) {
    return {
      success: false,
      authenticated: false,
      message: 'Please log in with your phone number to check your wallet balance and transactions.',
      balance: 0,
      transactions: [],
    };
  }

  try {
    const wallet = await db.customerWallet.findUnique({
      where: { customerId: context.customerId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            type: true,
            amount: true,
            balanceAfter: true,
            status: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    if (!wallet) {
      return {
        success: true,
        authenticated: true,
        balance: 0,
        transactions: [],
        message:
          'Your Junk It Out wallet balance is ₹0.00. You can top up your wallet or pay via Razorpay for pickups.',
      };
    }

    return {
      success: true,
      authenticated: true,
      balance: wallet.balance,
      transactions: wallet.transactions.map((t) => ({
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        status: t.status,
        reason: t.reason || 'General transaction',
        date: t.createdAt.toISOString(),
      })),
      message: `Your current wallet balance is ₹${wallet.balance.toFixed(2)}.`,
    };
  } catch {
    return {
      success: false,
      authenticated: true,
      balance: 0,
      transactions: [],
      message: 'Unable to retrieve wallet details at this time.',
    };
  }
}

/**
 * 5. RETRIEVE SUBSCRIPTION PLANS & ACTIVE MEMBERSHIP
 */
export async function getSubscriptionPlans(context: SupportChatContext) {
  try {
    const offers = await db.subscriptionOffer.findMany({
      where: { active: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        durationMonths: true,
        price: true,
        benefitsJson: true,
      },
    });

    let activeSubscription: any = null;
    if (context.customerId) {
      const sub = await db.customerSubscription.findFirst({
        where: {
          customerId: context.customerId,
          status: 'ACTIVE',
        },
        include: { offer: true },
      });
      if (sub) {
        activeSubscription = {
          planName: sub.offer?.name,
          startDate: sub.startDate.toISOString(),
          expiryDate: sub.expiryDate.toISOString(),
          status: sub.status,
        };
      }
    }

    const plans = offers.map((o) => {
      let benefits: string[] = [];
      try {
        benefits = JSON.parse(o.benefitsJson || '[]');
      } catch {}
      return {
        id: o.id,
        name: o.name,
        price: o.price,
        durationMonths: o.durationMonths,
        description: o.description,
        benefits,
      };
    });

    return {
      success: true,
      plans,
      activeSubscription,
      summary:
        'Junk It Out offers Quarterly (₹299/3 months), Six Months (₹399/6 months), and Annual (₹599/12 months) subscription plans with priority dispatch, exclusive pickup offers, and extended savings.',
    };
  } catch {
    return {
      success: true,
      plans: [
        {
          name: 'Quarterly',
          durationMonths: 3,
          price: 299,
          benefits: ['Priority support', 'Exclusive pickup offers'],
        },
        {
          name: 'Six Months',
          durationMonths: 6,
          price: 399,
          benefits: ['Priority support', 'Exclusive pickup offers', 'Extended member savings'],
        },
        {
          name: 'Annual',
          durationMonths: 12,
          price: 599,
          benefits: [
            'Priority support',
            'Exclusive pickup offers',
            'Extended member savings',
            'Annual member rewards',
          ],
        },
      ],
      activeSubscription: null,
      summary:
        'Junk It Out offers Quarterly (₹299), Six Months (₹399), and Annual (₹599) plans.',
    };
  }
}

/**
 * 6. AUTHORIZED CUSTOMER DISPUTES RETRIEVAL
 */
export async function getAuthenticatedCustomerDisputes(context: SupportChatContext) {
  if (!context.customerId) {
    return {
      success: false,
      authenticated: false,
      message: 'Please log in to view your dispute and complaint tickets.',
      disputes: [],
    };
  }

  try {
    const complaints = await db.complaint.findMany({
      where: { customerId: context.customerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        category: true,
        description: true,
        status: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
    });

    return {
      success: true,
      authenticated: true,
      disputes: complaints.map((c) => ({
        ticketId: c.id,
        referenceNumber: `JIO-${c.id.slice(0, 8).toUpperCase()}`,
        orderNumber: c.order?.orderNumber || 'General Support',
        category: c.category,
        status: c.status,
        filedAt: c.createdAt.toISOString(),
      })),
    };
  } catch {
    return {
      success: false,
      authenticated: true,
      message: 'Unable to retrieve disputes at this time.',
      disputes: [],
    };
  }
}

/**
 * 7. CREATE SUPPORT COMPLAINT / ESCALATION TICKET
 * Saves real complaint in the database and returns authoritative ticket reference.
 */
export async function createLiveSupportComplaint(
  context: SupportChatContext,
  data: { category?: string; description: string; orderNumber?: string }
) {
  const description = (data.description || '').trim();
  if (!description) {
    return {
      success: false,
      message: 'Complaint description is required.',
    };
  }

  try {
    let orderId: string | null = null;
    if (data.orderNumber && context.customerId) {
      const order = await db.order.findFirst({
        where: {
          orderNumber: { contains: data.orderNumber.trim(), mode: 'insensitive' },
          customerId: context.customerId,
        },
        select: { id: true },
      });
      if (order) orderId = order.id;
    }

    if (context.customerId) {
      const complaint = await db.complaint.create({
        data: {
          customerId: context.customerId,
          orderId,
          category: data.category || 'GENERAL_SUPPORT',
          description,
          status: 'OPEN',
        },
      });
      await notifySupportEscalation({
        customerName: context.name || 'Authenticated customer',
        customerPhone: context.phone || 'Unavailable',
        orderId,
        question: description,
        summary: `Customer support escalation for ${data.category || 'general support'}.`,
        ticketId: complaint.id,
      });

      return {
        success: true,
        ticketId: complaint.id,
        referenceNumber: `JIO-${complaint.id.slice(0, 8).toUpperCase()}`,
        status: 'OPEN',
        message: `Your complaint has been successfully registered under ticket reference JIO-${complaint.id.slice(0, 8).toUpperCase()}. Our support operations desk will review it within 2 hours.`,
      };
    } else {
      // Unauthenticated visitor -> store as ContactEnquiry
      const enquiry = await db.contactEnquiry.create({
        data: {
          name: context.name || 'Website Visitor',
          phone: context.phone || '9999999999',
          email: 'support@junkitout.in',
          subject: data.category || 'General Support Escalation',
          message: description,
          status: 'OPEN',
        },
      });
      await notifySupportEscalation({
        customerName: context.name || 'Website visitor',
        customerPhone: context.phone || 'Unavailable',
        question: description,
        summary: `Website support escalation for ${data.category || 'general support'}.`,
        ticketId: enquiry.id,
      });

      return {
        success: true,
        ticketId: enquiry.id,
        referenceNumber: `JIO-ENQ-${enquiry.id.slice(0, 8).toUpperCase()}`,
        status: 'OPEN',
        message: `Your enquiry has been registered under ticket reference JIO-ENQ-${enquiry.id.slice(0, 8).toUpperCase()}. Please log in for personalized order tracking.`,
      };
    }
  } catch {
    return {
      success: false,
      message: 'Could not create complaint record at this time.',
    };
  }
}

/**
 * 8. CALCULATE LIVE PICKUP ESTIMATE
 */
export async function calculateLiveEstimate(
  items: Array<{ categoryName: string; weightKg: number }>
) {
  try {
    const categories = await db.wasteCategory.findMany({ where: { active: true } });
    const summaryItems = items.map((item) => {
      const matched = categories.find(
        (c) =>
          c.name.toLowerCase() === item.categoryName.toLowerCase() ||
          c.name.toLowerCase().includes(item.categoryName.toLowerCase()) ||
          item.categoryName.toLowerCase().includes(c.name.toLowerCase())
      );
      return {
        categoryId: matched?.id || 'unknown',
        categoryName: matched?.name || item.categoryName,
        pricePerKg: matched ? matched.pricePerKg : 15,
        weightKg: Number(item.weightKg) || 1,
        type: matched?.type || 'RECYCLABLE_BUY',
      };
    });

    const summary = calculatePickupSummary(summaryItems, PICKUP_SERVICE_CHARGE);

    return {
      success: true,
      materialCount: summary.materialCount,
      totalWeightKg: summary.totalWeightKg,
      pickupValue: summary.pickupValue,
      serviceCharge: summary.serviceCharge,
      originalServiceCharge: summary.originalServiceCharge,
      isServiceChargeWaived: summary.isServiceChargeWaived,
      totalAmountPayable: summary.totalAmountPayable,
      items: summary.items.map((i) => ({
        material: i.categoryName,
        weightKg: i.weightKg,
        ratePerKg: i.pricePerKg,
        isOfferApplied: i.isOfferApplied,
        amount: i.materialAmount,
      })),
    };
  } catch {
    return {
      success: false,
      error: 'Failed to calculate estimate dynamically.',
    };
  }
}

/**
 * 9. DETERMINISTIC INTELLIGENT FALLBACK ENGINE
 * Covers English, Kannada (ಕನ್ನಡ), and Hinglish queries across all 6 approved knowledge domains:
 * 1) Pickup booking and scheduling
 * 2) Pricing and accepted materials
 * 3) Wallets and transactions
 * 4) Subscriptions
 * 5) Disputes
 * 6) Refunds
 */
export async function generateFallbackSupportResponse(
  userQuery: string,
  context: SupportChatContext
): Promise<{ text: string; suggestedQuestions: string[]; referenceId?: string }> {
  const q = userQuery.toLowerCase().trim();

  // 1. Language detection
  const isKannada = /[\u0C80-\u0CFF]/.test(userQuery);
  const isHinglish =
    /\b(kya|hai|kitna|kaise|karo|batao|karenge|mujhe|mera|meri|paisa|rate|bhav|daam|chahiye|kab|aayega|aayegi|cancel|order|kaha|kahan|shikayat)\b/i.test(
      userQuery
    );

  // 2. High-Priority: Human Support Escalation Request
  if (
    q.includes('human') ||
    q.includes('representative') ||
    q.includes('support representative') ||
    q.includes('escalate') ||
    q.includes('speak with a person') ||
    q.includes('talk to a person') ||
    q.includes('human agent') ||
    q.includes('support agent') ||
    q.includes('talk to agent') ||
    q.includes('speak to agent') ||
    q.includes('executive') ||
    q.includes('supervisor') ||
    (isKannada && (q.includes('ಮಾನವ') || q.includes('ಪ್ರತಿನಿಧಿ')))
  ) {
    const complaintResult = await createLiveSupportComplaint(context, {
      category: 'HUMAN_SUPPORT_ESCALATION',
      description: userQuery,
    });
    const refId = complaintResult.success ? complaintResult.referenceNumber : undefined;

    return {
      text: isKannada
        ? `ಖಂಡಿತ, ನಿಮ್ಮ ವಿನಂತಿಯನ್ನು ನಮ್ಮ ಕಾರ್ಯಾಚರಣೆ ತಂಡಕ್ಕೆ ಅಧಿಕೃತ ಬೆಂಬಲ ಟಿಕೆಟ್ ಆಗಿ ದಾಖಲಿಸಲಾಗಿದೆ${refId ? ` (ಟಿಕೆಟ್ ಸಂಖ್ಯೆ: ${refId})` : ''}. ನಮ್ಮ ಬೆಂಬಲ ಪ್ರತಿನಿಧಿ ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.`
        : isHinglish
        ? `Bilkul, maine aapke sawal ke liye formal support ticket create kar diya hai${refId ? ` (Ticket Reference: ${refId})` : ''}. Hamare operations team ke representative jald hi aapse contact karenge.`
        : `I have registered an official human escalation support request for you${refId ? ` with reference ${refId}` : ''}. Our operations desk has been notified and a representative will follow up with you promptly.`,
      suggestedQuestions: ['Where is my pickup agent?', 'Refund policy', 'Check scrap prices'],
      referenceId: refId,
    };
  }

  // 2. Wallets and Transactions
  if (
    q.includes('wallet') ||
    q.includes('topup') ||
    q.includes('top up') ||
    q.includes('wallet balance') ||
    q.includes('wallet transaction') ||
    (isKannada && (q.includes('ವಾಲೆಟ್') || q.includes('ಖಾತೆ')))
  ) {
    if (!context.customerId) {
      return {
        text: isKannada
          ? `Junk It Out ವಾಲೆಟ್ ವೈಶಿಷ್ಟ್ಯ:\n• ವಾಲೆಟ್ ಮೂಲಕ ಸುಲಭವಾಗಿ ಸ್ಕ್ರ್ಯಾಪ್ ಪಿಕಪ್ ಶುಲ್ಕ ಪಾವತಿಸಬಹುದು.\n• Razorpay ಮೂಲಕ ಸುರಕ್ಷಿತವಾಗಿ ಹಣ ತುಂಬಿಕೊಳ್ಳಬಹುದು (Top-up).\n• ನಿಮ್ಮ ವಾಲೆಟ್ ಬ್ಯಾಲೆನ್ಸ್ ನೋಡಲು ದಯವಿಟ್ಟು ನೋಂದಾಯಿತ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯೊಂದಿಗೆ ಲಾಗಿನ್ ಆಗಿ.`
          : isHinglish
          ? `Junk It Out Wallet ki jankari:\n• Wallet se doorstep pickups ke liye easily pay kar sakte hain.\n• Razorpay se wallet instant top-up kar sakte hain.\n• Apna wallet balance check karne ke liye kripya Junk It Out account me login karein.`
          : `Junk It Out Wallet & Transactions:\n• Digital Wallet: Conveniently pay for doorstep pickups directly from your Junk It Out wallet balance.\n• Secure Top-Up: Re-charge your balance anytime via Razorpay (UPI, Cards, NetBanking).\n• Immutable Adjustments: All credit and debit transactions are recorded with audit reasons and your balance never goes negative.\n• Check Balance: Log in to view your live wallet balance and transaction statement in your profile.`,
        suggestedQuestions: ['How do I log in?', 'What is the refund policy?', 'Check scrap rates'],
      };
    }

    const walletData = await getAuthenticatedCustomerWallet(context);
    return {
      text: isKannada
        ? `ನಿಮ್ಮ Junk It Out ವಾಲೆಟ್ ಮಾಹಿತಿ:\n• ಪ್ರಸ್ತುತ ಬ್ಯಾಲೆನ್ಸ್: ₹${walletData.balance.toFixed(2)}\n• ಇತ್ತೀಚಿನ ವಹಿವಾಟುಗಳು: ${walletData.transactions.length > 0 ? walletData.transactions.map((t) => `${t.type}: ₹${t.amount.toFixed(2)} (${t.status})`).join(', ') : 'ಯಾವುದೇ ಇತ್ತೀಚಿನ ವಹಿವಾಟುಗಳಿಲ್ಲ.'}\n• ನೀವು ಪ್ರೊಫೈಲ್ ಪುಟದಲ್ಲಿ Razorpay ಬಳಸಿ ಟಾಪ್-ಅಪ್ ಮಾಡಬಹುದು.`
        : isHinglish
        ? `Aapka Junk It Out Wallet:\n• Current Balance: ₹${walletData.balance.toFixed(2)}\n• Recent Transactions: ${walletData.transactions.length > 0 ? walletData.transactions.map((t) => `${t.type}: ₹${t.amount.toFixed(2)} (${t.status})`).join(', ') : 'Koi recent transaction nahi hai.'}\n• Aap profile me Wallet section se easily Razorpay se top-up kar sakte hain.`
        : `Your Junk It Out Wallet Summary:\n• Available Balance: ₹${walletData.balance.toFixed(2)}\n• Recent Transactions: ${walletData.transactions.length > 0 ? walletData.transactions.map((t) => `\n  - ${t.type.replace(/_/g, ' ')}: ₹${t.amount.toFixed(2)} (${t.status})`).join('') : 'No recent transactions.'}\n• You can top up your wallet or pay for upcoming pickups in the Customer Wallet dashboard.`,
      suggestedQuestions: ['How do I top up my wallet?', 'Subscription plans', 'Where is my pickup agent?'],
    };
  }

  // 3. Subscriptions and Membership Plans
  if (
    q.includes('subscription') ||
    q.includes('membership') ||
    q.includes('plan') ||
    q.includes('quarterly') ||
    q.includes('annual') ||
    (isKannada && (q.includes('ಚಂದಾದಾರಿಕೆ') || q.includes('ಯೋಜನೆ')))
  ) {
    const subData = await getSubscriptionPlans(context);
    const planText = subData.plans
      .map((p) => `• ${p.name} (${p.durationMonths} months): ₹${p.price} — ${p.benefits.join(', ')}`)
      .join('\n');

    return {
      text: isKannada
        ? `Junk It Out ಸದಸ್ಯತ್ವ ಯೋಜನೆಗಳು (Subscription Plans):\n${planText}\n\nಪ್ರಯೋಜನಗಳು: ಆದ್ಯತೆಯ ಪಿಕಪ್ ರವಾನೆ, ವಿಶೇಷ ಸ್ಕ್ರ್ಯಾಪ್ ಬೋನಸ್ ದರಗಳು ಮತ್ತು ಮೀಸಲಾದ ಬೆಂಬಲ ಡೆಸ್ಕ್.`
        : isHinglish
        ? `Junk It Out Subscription Plans:\n${planText}\n\nBenefits: Priority agent dispatch, exclusive scrap bonus offers, aur dedicated support.`
        : `Junk It Out Subscription Plans:\n${planText}\n\nMember Benefits:\n• Priority Field Agent Dispatch in JP Nagar & BTM Layout\n• Exclusive bonus scrap rates and waiver guarantees\n• Dedicated priority customer support desk\n• Manage your subscription directly from your Customer Profile.`,
      suggestedQuestions: ['Wallet & payments', 'Check scrap prices', 'How do I book a pickup?'],
    };
  }

  // 4. Disputes and Complaints
  if (
    q.includes('dispute') ||
    q.includes('complaint') ||
    q.includes('shikayat') ||
    q.includes('weight issue') ||
    q.includes('wrong weight') ||
    q.includes('scale mismatch') ||
    (isKannada && (q.includes('ದೂರು') || q.includes('ವಿವಾದ') || q.includes('ತೂಕ')))
  ) {
    if (context.customerId) {
      const disputesData = await getAuthenticatedCustomerDisputes(context);
      const activeTickets = disputesData.disputes.length > 0
        ? `\n\nYour active tickets:\n${disputesData.disputes.map((d) => `• Ticket #${d.referenceNumber} (${d.category}): Status ${d.status}`).join('\n')}`
        : '';

      return {
        text: isKannada
          ? `Junk It Out ವಿವಾದ ಪರಿಹಾರ ಪ್ರಕ್ರಿಯೆ:\n• ತೂಕದಲ್ಲಿ ವ್ಯತ್ಯಾಸವಿದ್ದರೆ ಸ್ಥಳದಲ್ಲೇ ಡಿಜಿಟಲ್ ತೂಕ ಮಾಪಕದಲ್ಲಿ ಮರು-ತೂಕ ಮಾಡಲು ಏಜೆಂಟ್‌ಗೆ ಕೇಳಬಹುದು.\n• ವಿವಾದ ಜೀವನಚಕ್ರ: OPEN → UNDER_REVIEW → AWAITING_CUSTOMER → RESOLVED / REJECTED.\n• ದೂರು ದಾಖಲಿಸಲು ಸಮಸ್ಯೆಯ ವಿವರವನ್ನು ನನಗೆ ತಿಳಿಸಿ, ನಾನು ಅಧಿಕೃತ ಟಿಕೆಟ್ ದಾಖಲಿಸುತ್ತೇನೆ.${activeTickets}`
          : isHinglish
          ? `Junk It Out Dispute Management Process:\n• Weight mismatch hone par agent ke calibrated digital scale par on-the-spot re-weighing kara sakte hain.\n• Dispute Lifecycle: OPEN → UNDER_REVIEW → AWAITING_CUSTOMER → RESOLVED / REJECTED.\n• Complaint raise karne ke liye issue details batayein, main official ticket generate kar dunga.${activeTickets}`
          : `Junk It Out Dispute Management Lifecycle:\n• On-Spot Verification: If you suspect a weight mismatch, ask the agent to immediately re-weigh items on their calibrated digital scale.\n• Status Lifecycle: OPEN → UNDER_REVIEW → AWAITING_CUSTOMER → RESOLVED / REJECTED.\n• Live Timeline: Once logged, track your dispute's live chronological progress under Customer Support.\n• To register an official dispute, please describe your issue and I will create a ticket reference for you.${activeTickets}`,
        suggestedQuestions: ['Request human support', 'What is the refund policy?', 'Where is my pickup agent?'],
      };
    }

    return {
      text: isKannada
        ? `Junk It Out ವಿವಾದ ನಿರ್ವಹಣೆ:\n• ತೂಕ ವ್ಯತ್ಯಾಸವಿದ್ದರೆ ಸ್ಥಳದಲ್ಲೇ ಏಜೆಂಟ್‌ಗೆ ಮರು-ತೂಕ ಮಾಡಲು ಕೋರಬಹುದು.\n• ಲಾಗಿನ್ ಆದ ನಂತರ ನೀವು ಆರ್ಡರ್ ವಿವಾದವನ್ನು ದಾಖಲಿಸಬಹುದು ಮತ್ತು ಲೈವ್ ಸ್ಥಿತಿಯನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡಬಹುದು.`
        : isHinglish
        ? `Junk It Out Dispute Resolution:\n• Weight issue aane par agent ke digital scale par spot re-weighing request kar sakte hain.\n• Please login to submit and track your order dispute tickets.`
        : `Junk It Out Dispute Resolution:\n• Weight Disputes: Request immediate on-the-spot re-weighing on the agent's calibrated digital scale.\n• Formal Disputes: Support complaints follow a strict 5-stage lifecycle (OPEN → UNDER_REVIEW → AWAITING_CUSTOMER → RESOLVED / REJECTED) with full audit timeline tracking.\n• Please log in with your phone number to submit and track order disputes.`,
      suggestedQuestions: ['Log in to track dispute', 'Check scrap rates', 'Refund policy'],
    };
  }

  // 5. Payments, Refunds, and Razorpay
  if (
    q.includes('refund') ||
    q.includes('payment') ||
    q.includes('razorpay') ||
    q.includes('upi') ||
    q.includes('payout') ||
    q.includes('fail') ||
    q.includes('money') ||
    q.includes('paisa') ||
    (isKannada && (q.includes('ಪಾವತಿ') || q.includes('ಹಣ') || q.includes('ರೀಫಂಡ್')))
  ) {
    return {
      text: isKannada
        ? `ಪಾವತಿ ಮತ್ತು ಮರುಪಾವತಿ ನಿಯಮಗಳು:\n• ಗ್ರಾಹಕ ಪಾವತಿಗಳು: Razorpay ಮೂಲಕ UPI, ಕಾರ್ಡ್‌ಗಳು ಅಥವಾ ನೆಟ್‌ಬ್ಯಾಂಕಿಂಗ್ ಬಳಸಿ ಸುರಕ್ಷಿತವಾಗಿ ನಡೆಯುತ್ತವೆ.\n• ರದ್ದುಗೊಳಿಸಿದ ಆರ್ಡರ್ ಮರುಪಾವತಿ: ನೀವು ಏಜೆಂಟ್ ಆಗಮನಕ್ಕೆ ಮುನ್ನ ರದ್ದುಗೊಳಿಸಿದರೆ, 100% ಸ್ವಯಂಚಾಲಿತ ಮರುಪಾವತಿ 3–5 ವ್ಯವಹಾರ ದಿನಗಳಲ್ಲಿ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಗೆ ಜಮೆಯಾಗುತ್ತದೆ.\n• ಸ್ಕ್ರ್ಯಾಪ್ ಪಾವತಿಗಳು (Payouts): ನಿಜವಾದ ತೂಕದ ಆಧಾರದ ಮೇಲೆ ನಿಮ್ಮ ಖಾತೆಗೆ NEFT/UPI ಮೂಲಕ ವರ್ಗಾಯಿಸಲಾಗುತ್ತದೆ.`
        : isHinglish
        ? `Payments aur Refunds ki jankari:\n• Booking Payment: Razorpay se UPI/Cards/NetBanking ke through safely pay kar sakte hain.\n• Cancellation & Refund: Agar aap agent arrival se pehle cancel karte hain, toh 100% automated refund trigger hota hai aur 3-5 business days me original account me aa jata hai.\n• Doorstep Weighing: Calibrated digital scale se exact weight hone ke baad payment settle hota hai.`
        : `Payments & Refunds at Junk It Out:\n• Booking Payments: Processed securely via Razorpay checkout supporting UPI, Credit/Debit Cards, NetBanking, and Customer Wallet balance.\n• Cancellation & Refunds: If you cancel before the agent arrives, a 100% automated refund is initiated and credited to your original payment method within 3–5 business days.\n• Scrap Settlement: If your recyclable value exceeds service charges, scrap payouts are disbursed directly via verified UPI or bank transfer.\n• Verified Records: We never claim a payment succeeded without database confirmation.`,
      suggestedQuestions: ['Where is my pickup agent?', 'Raise a dispute / complaint', 'Current scrap rates'],
    };
  }

  // 6. Order Tracking
  if (
    q.includes('order') ||
    q.includes('track') ||
    q.includes('status') ||
    q.includes('where is') ||
    q.includes('arrive') ||
    q.includes('kahan hai') ||
    q.includes('order status') ||
    (isKannada && (q.includes('ಆರ್ಡರ್') || q.includes('ಸ್ಥಿತಿ') || q.includes('ಏಜೆಂಟ್')))
  ) {
    if (!context.customerId) {
      if (isKannada) {
        return {
          text: 'ನಿಮ್ಮ ಆರ್ಡರ್ ಸ್ಥಿತಿಯನ್ನು ಪರಿಶೀಲಿಸಲು, ದಯವಿಟ್ಟು ನಿಮ್ಮ ನೋಂದಾಯಿತ ಮೊಬೈಲ್ ಸಂಖ್ಯೆಯೊಂದಿಗೆ Junk It Out ಗೆ ಲಾಗಿನ್ ಆಗಿ. ಲಾಗಿನ್ ಆದ ನಂತರ ನಾನು ನಿಮ್ಮ ಪಿಕಪ್ ವಿವರಗಳು ಮತ್ತು ಏಜೆಂಟ್ ಲೈವ್ ಸ್ಥಿತಿಯನ್ನು ತೋರಿಸಬಲ್ಲೆ.',
          suggestedQuestions: ['ನಾನು ಹೇಗೆ ಲಾಗಿನ್ ಆಗುವುದು?', 'ಪ್ಲಾಸ್ಟಿಕ್ ಬೆಲೆ ಎಷ್ಟು?', 'ಸೇವೆ ಲಭ್ಯವಿರುವ ಪ್ರದೇಶಗಳು'],
        };
      }
      if (isHinglish) {
        return {
          text: 'Apna order track karne ke liye kripya apne registered phone number se Junk It Out me login karein. Login ke baad main aapke order ka exact live status aur agent details dikha sakta hoon.',
          suggestedQuestions: ['Login kaise karein?', 'Current rates kya hain?', 'Pickup book kaise karein?'],
        };
      }
      return {
        text: 'To track your pickup order, please log in with your registered phone number. Once logged in, I can instantly look up your live order status, scheduled slot, and assigned agent arrival details.',
        suggestedQuestions: ['How do I log in?', 'What materials do you accept?', 'Current scrap price list'],
      };
    }

    const orderData = await getAuthenticatedCustomerOrders(context);
    if (!orderData.orders || orderData.orders.length === 0) {
      return {
        text: isKannada
          ? 'ನಿಮ್ಮ ಖಾತೆಯಲ್ಲಿ ಸದ್ಯಕ್ಕೆ ಯಾವುದೇ ಸಕ್ರಿಯ ಅಥವಾ ಹಿಂದಿನ ಆರ್ಡರ್‌ಗಳು ಕಂಡುಬಂದಿಲ್ಲ. ನೀವು ಹೊಸ ಡೋರ್‌ಸ್ಟೆಪ್ ಪಿಕಪ್ ಅನ್ನು ಬುಕ್ ಮಾಡಲು ಬಯಸುವಿರಾ?'
          : isHinglish
          ? 'Aapke account me koi active ya previous order nahi mila. Kya aap naya doorstep pickup book karna chahte hain?'
          : 'I checked our live records, and there are currently no active or previous pickup bookings under your account. Would you like to schedule a new doorstep pickup?',
        suggestedQuestions: ['Book a new pickup', 'Accepted materials & pricing', 'Service areas'],
      };
    }

    const latest = orderData.orders[0];
    const agentText = latest.agent
      ? `Assigned Agent: ${latest.agent.name} (${latest.agent.vehicleType})`
      : 'Agent assignment is in progress';

    return {
      text: isKannada
        ? `ನಿಮ್ಮ ಇತ್ತೀಚಿನ ಆರ್ಡರ್ #${latest.orderNumber} ಸ್ಥಿತಿ: ${latest.status}.\n• ದಿನಾಂಕ/ಸ್ಲಾಟ್: ${latest.scheduledSlot || 'ASAP (20–30 ನಿಮಿಷ)'}\n• ಪಾವತಿ ಸ್ಥಿತಿ: ${latest.paymentStatus}\n• ಮೊತ್ತ: ₹${latest.finalAmount.toFixed(2)}\n• ಏಜೆಂಟ್: ${agentText}`
        : isHinglish
        ? `Aapke latest order #${latest.orderNumber} ka status "${latest.status}" hai.\n• Slot: ${latest.scheduledSlot || 'ASAP (20–30 mins)'}\n• Payment: ${latest.paymentStatus}\n• Total Amount: ₹${latest.finalAmount.toFixed(2)}\n• Agent: ${agentText}`
        : `Here is the status of your latest pickup order #${latest.orderNumber}:\n• Status: ${latest.status}\n• Scheduled Slot: ${latest.scheduledSlot || 'ASAP (20–30 mins)'}\n• Payment Status: ${latest.paymentStatus}\n• Payable Amount: ₹${latest.finalAmount.toFixed(2)}\n• ${agentText}`,
      suggestedQuestions: ['How do I cancel or reschedule?', 'How do payments work?', 'Raise a complaint'],
    };
  }

  // 7. Pricing / Rates
  if (
    q.includes('price') ||
    q.includes('pricing') ||
    q.includes('rate') ||
    q.includes('how much') ||
    q.includes('per kg') ||
    q.includes('offer') ||
    q.includes('7 kg') ||
    q.includes('7kg') ||
    q.includes('99') ||
    q.includes('charge') ||
    q.includes('cost') ||
    q.includes('bhav') ||
    q.includes('daam') ||
    q.includes('kitna') ||
    (isKannada && (q.includes('ಬೆಲೆ') || q.includes('ದರ') || q.includes('ರೂಪಾಯಿ')))
  ) {
    const pricing = await getLiveMaterialsAndPricing();
    const materialSummary = pricing.materials
      .slice(0, 5)
      .map((m) => `• ${m.name}: ₹${m.pricePerKg}/kg`)
      .join('\n');

    if (isKannada) {
      return {
        text: `Junk It Out ನಲ್ಲಿ ನಮ್ಮ ಪ್ರಸ್ತುತ ಲೈವ್ ದರಗಳು (ಡೇಟಾಬೇಸ್‌ನಿಂದ):\n${materialSummary}\n\n✨ ವಿಶೇಷ ಆಫರ್: ಯಾವುದೇ ಒಂದು ವಸ್ತುವಿನ ತೂಕ 7 kg ಗಿಂತ ಹೆಚ್ಚಿದ್ದರೆ, ಆ ವಸ್ತುವಿಗೆ ಕೇವಲ ₹99 ಫ್ಲಾಟ್ ದರ ಅನ್ವಯಿಸುತ್ತದೆ!\n🎉 ಸೇವಾ ಶುಲ್ಕ: ಸಾಮಾನ್ಯ ₹50 ಡೋರ್‌ಸ್ಟೆಪ್ ಪಿಕಪ್ ಶುಲ್ಕವನ್ನು ಸಂಪೂರ್ಣವಾಗಿ ಮನ್ನಾ ಮಾಡಲಾಗಿದೆ (FREE / ₹0).`,
        suggestedQuestions: ['ಇ-ವೇಸ್ಟ್ ಸಂಗ್ರಹಿಸುತ್ತೀರಾ?', 'ಪಿಕಪ್ ಬುಕ್ ಮಾಡುವುದು ಹೇಗೆ?', 'ಕನಿಷ್ಠ ತೂಕ ಎಷ್ಟು?'],
      };
    }

    if (isHinglish) {
      return {
        text: `Junk It Out ke live scrap rates (direct database se):\n${materialSummary}\n\n✨ Special Pricing Rule: Agar kisi individual material ka weight 7 kg se jyada hai, toh us material par special ₹99 offer price apply hota hai!\n🎉 Service Charge: Normal ₹50 doorstep collection charge abhi FREE (₹0) hai!`,
        suggestedQuestions: ['E-waste collect karte ho?', 'Pickup kaise book karein?', 'Minimum weight kitna hai?'],
      };
    }

    return {
      text: `Here are our current live material rates retrieved directly from the Junk It Out database:\n${materialSummary}\n\n✨ Special Material Pricing Rule: If the quantity of any individual material exceeds 7 kg, the special ₹99 offer price applies to that material.\n🎉 Doorstep Service Charge: The standard ₹50 service charge is currently WAIVED (FREE / ₹0), so you only pay for your materials!`,
      suggestedQuestions: ['Do you collect e-waste?', 'How do I book a pickup?', 'What is the minimum weight?'],
    };
  }

  // 8. Accepted & Non-Accepted Materials
  if (
    q.includes('accept') ||
    q.includes('material') ||
    q.includes('collect') ||
    q.includes('electronic') ||
    q.includes('e-waste') ||
    q.includes('plastic') ||
    q.includes('paper') ||
    q.includes('metal') ||
    q.includes('laptop') ||
    q.includes('cardboard') ||
    q.includes('junk') ||
    q.includes('not accept') ||
    (isKannada && (q.includes('ಯಾವ') || q.includes('ವಸ್ತು') || q.includes('ಕಸ')))
  ) {
    const pricing = await getLiveMaterialsAndPricing();
    const matNames = pricing.materials.map((m) => m.name).join(', ');

    if (isKannada) {
      return {
        text: `ನಾವು ಈ ಕೆಳಗಿನ ವಸ್ತುಗಳನ್ನು ಸ್ವೀಕರಿಸುತ್ತೇವೆ:\n${matNames}\n\n• ಇ-ವೇಸ್ಟ್: ಹಳೆಯ ಲ್ಯಾಪ್‌ಟಾಪ್‌ಗಳು, ಫೋನ್‌ಗಳು, ಕೇಬಲ್‌ಗಳು, ಗೃಹೋಪಯೋಗಿ ವಸ್ತುಗಳು.\n• ರಿಸೈಕ್ಲೇಬಲ್ಸ್: ಪೇಪರ್, ರಟ್ಟು, ಪ್ಲಾಸ್ಟಿಕ್ ಬಾಟಲಿಗಳು, ಲೋಹ.\n\n❌ ಸ್ವೀಕರಿಸುವುದಿಲ್ಲ: ಹಸಿ ಅಡುಗೆಮನೆ ತ್ಯಾಜ್ಯ, ಅಪಾಯಕಾರಿ ರಾಸಾಯನಿಕಗಳು, ವೈದ್ಯಕೀಯ ತ್ಯಾಜ್ಯ.`,
        suggestedQuestions: ['ಪ್ಲಾಸ್ಟಿಕ್ ಬೆಲೆ ಎಷ್ಟು?', 'ಪಿಕಪ್ ಬುಕ್ ಮಾಡುವುದು ಹೇಗೆ?', 'ನನ್ನ ಪ್ರದೇಶದಲ್ಲಿ ಸೇವೆ ಇದೆಯೇ?'],
      };
    }

    if (isHinglish) {
      return {
        text: `Junk It Out ye saare materials doorstep se collect karta hai:\n${matNames}\n\n• E-Waste: Laptops, phones, cables, small electronics, batteries.\n• Recyclables: Plastic bottles, cardboard/paper, metals, dry household junk.\n\n❌ Hum wet food waste, toxic chemicals aur medical waste accept nahi karte.`,
        suggestedQuestions: ['Rates kya hain?', 'Pickup kaise schedule karein?', 'Minimum weight kitna hai?'],
      };
    }

    return {
      text: `Junk It Out accepts a wide range of doorstep recyclables and junk:\n\nAccepted Materials:\n• Electronic Waste (E-Waste): Old laptops, mobile phones, chargers, CPUs, appliances, cables.\n• Paper & Cardboard: Cartons, newspapers, books, office paper.\n• Plastic Waste: Rigid plastics, PET bottles, containers.\n• Household Dry Junk: Clutter, metal scrap, old fixtures.\n\n❌ NOT Accepted: Wet kitchen waste, hazardous chemicals, biomedical waste, or explosives.`,
      suggestedQuestions: ['What is the price per kg?', 'How do I book a pickup?', 'Which areas are supported?'],
    };
  }

  // 9. Booking, Scheduling, Timings & Service Areas (Exclusively BTM Layout & JP Nagar)
  if (
    q.includes('book') ||
    q.includes('booking') ||
    q.includes('schedule') ||
    q.includes('scheduling') ||
    q.includes('timing') ||
    q.includes('timings') ||
    q.includes('hour') ||
    q.includes('hours') ||
    q.includes('operating') ||
    q.includes('operational') ||
    q.includes('doorstep process') ||
    q.includes('how does pickup work') ||
    q.includes('area') ||
    q.includes('location') ||
    q.includes('supported') ||
    q.includes('where do you') ||
    q.includes('bengaluru') ||
    q.includes('bangalore') ||
    q.includes('btm') ||
    q.includes('jp nagar') ||
    q.includes('place') ||
    q.includes('two places') ||
    (isKannada && (q.includes('ಪ್ರದೇಶ') || q.includes('ಎಲ್ಲಿ') || q.includes('ಸ್ಥಳ') || q.includes('ಬುಕಿಂಗ್') || q.includes('ಸಮಯ')))
  ) {
    if (isKannada) {
      return {
        text: `Junk It Out ಪ್ರಸ್ತುತ ಬೆಂಗಳೂರಿನ ಕೇವಲ 2 ಸ್ಥಳಗಳಲ್ಲಿ ಮಾತ್ರ ಡೋರ್‌ಸ್ಟೆಪ್ ಪಿಕಪ್ ಸೇವೆಯನ್ನು ಒದಗಿಸುತ್ತಿದೆ:\n\n1. **JP Nagar (Phases 1 to 9)**\n2. **BTM Layout (1st & 2nd Stage)**\n\nಈ ಎರಡು ಪ್ರದೇಶಗಳಲ್ಲಿ ನಮ್ಮ ಏಜೆಂಟ್‌ಗಳು ಕೇವಲ 20–30 ನಿಮಿಷಗಳಲ್ಲಿ ಆಗಮಿಸುತ್ತಾರೆ. ಇತರೆ ಪ್ರದೇಶಗಳಿಗೆ ಶೀಘ್ರದಲ್ಲೇ ವಿಸ್ತರಿಸಲಾಗುವುದು.\n\n**ಸೇವಾ ಸಮಯ**: ಪ್ರತಿದಿನ ಬೆಳಗ್ಗೆ 8:00 ರಿಂದ ರಾತ್ರಿ 8:00 ರವರೆಗೆ.`,
        suggestedQuestions: ['ಪ್ಲಾಸ್ಟಿಕ್ ಬೆಲೆ ಎಷ್ಟು?', 'ಪಿಕಪ್ ಬುಕ್ ಮಾಡುವುದು ಹೇಗೆ?', 'ಇ-ವೇಸ್ಟ್ ಸಂಗ್ರಹಿಸುತ್ತೀರಾ?'],
      };
    }

    if (isHinglish) {
      return {
        text: `Junk It Out abhi Bengaluru me sirf 2 locations me doorstep pickup provide karta hai:\n\n1. **JP Nagar (Phases 1 to 9)**\n2. **BTM Layout (1st & 2nd Stage)**\n\nIn dono locations me hamare agents 20-30 minutes me pahunchte hain. In do locations ke alawa baki kisi bhi area me abhi service available nahi hai, hum jald hi expand kar rahe hain.\n\n**Service Timings**: 8:00 AM to 8:00 PM daily.`,
        suggestedQuestions: ['Rates kya hain?', 'Pickup kaise book karein?', 'E-waste accept karte ho?'],
      };
    }

    return {
      text: `Junk It Out currently provides doorstep pickup services in ONLY TWO areas of Bengaluru:\n\n1. **JP Nagar (Phases 1 to 9)**\n2. **BTM Layout (1st & 2nd Stage)**\n\nOur verified agents arrive within 20–30 minutes in these two locations. All other localities outside these two zones are strictly not serviceable yet. We are actively expanding to other areas soon!\n\n**Service Hours**: 8:00 AM – 8:00 PM Daily`,
      suggestedQuestions: ['Book a pickup now', 'Check scrap prices', 'What materials do you accept?'],
    };
  }

  // 11. General Greetings & Approved Public Knowledge
  const publicKnowledge = await retrievePublicKnowledge(userQuery);
  if (publicKnowledge) {
    return {
      text: `Here is the relevant information currently published by Junk It Out:\n\n${publicKnowledge}\n\nIf this does not answer your question, I can help raise a support ticket for our operations team.`,
      suggestedQuestions: ['Contact human support', 'How do I book a pickup?', 'What materials do you accept?'],
    };
  }

  // 12. Check if query is a greeting
  const isGreeting =
    /^(hi|hello|hey|namaste|namaskara|good morning|good afternoon|good evening)\b/i.test(q);
  if (isGreeting) {
    return {
      text: isKannada
        ? `ನಮಸ್ಕಾರ! ನಾನು Junk It Out ನ ಅಧಿಕೃತ AI ಗ್ರಾಹಕ ಬೆಂಬಲ ಸಹಾಯಕ. ನಾನು ತ್ಯಾಜ್ಯ ಸಂಗ್ರಹಣೆ ದರಗಳು, ಬುಕಿಂಗ್, ಆರ್ಡರ್ ಟ್ರ್ಯಾಕಿಂಗ್, ವಾಲೆಟ್ ಮತ್ತು ದೂರುಗಳಿಗೆ ಸಂಬಂಧಿಸಿದ ಪ್ರಶ್ನೆಗಳಿಗೆ 24/7 ಸಹಾಯ ಮಾಡಬಲ್ಲೆ. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?`
        : isHinglish
        ? `Namaste! Main Junk It Out ka AI customer support agent hoon. Main live scrap pricing, doorstep pickup booking, order tracking, wallet aur support complaints me aapki 24/7 help kar sakta hoon. Aaj main aapki kya madad kar sakta hoon?`
        : `Hello! I am your 24/7 Junk It Out Customer Support Assistant. I can help you with live scrap material rates, doorstep pickup bookings, real-time order tracking, wallet transactions, Razorpay payments, and support ticket escalations. How can I assist you today?`,
      suggestedQuestions: [
        'What materials do you accept & what are the rates?',
        'How do I book a doorstep pickup?',
        'Where is my pickup agent?',
        'Explain the ₹99 offer and waived service charge',
      ],
    };
  }

  // 13. Unknown / Unresolved Question Handling
  // Avoid inventing policies, rates, or coverage outside approved knowledge
  await logUnresolvedQuestion(userQuery, context, 'NO_APPROVED_KNOWLEDGE_MATCH');

  return {
    text: isKannada
      ? `ಕ್ಷಮಿಸಿ, ನನ್ನ ಬಳಿ ಈ ಪ್ರಶ್ನೆಗೆ ಅಧಿಕೃತ Junk It Out ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ. ತಪ್ಪು ಮಾಹಿತಿ ನೀಡುವುದನ್ನು ತಪ್ಪಿಸಲು, ಈ ಪ್ರಶ್ನೆಯನ್ನು ನಮ್ಮ ಆಪರೇಷನ್ಸ್ ಡೆಸ್ಕ್‌ಗೆ ದಾಖಲಿಸಿದ್ದೇನೆ. ನೀವು ಮಾನವ ಬೆಂಬಲ ಅಧಿಕಾರಿಯೊಂದಿಗೆ ಮಾತನಾಡಲು ಬಯಸುವಿರಾ?`
      : isHinglish
      ? `Maaf kijiye, mere paas is sawal ke liye Junk It Out ki verified policy jankari nahi hai. Galat information se bachne ke liye maine ye sawal support team ke liye record kar liya hai. Kya aap human support se baat karna chahte hain?`
      : `I do not have verified policy or service details regarding that specific inquiry. To ensure you receive strictly accurate information, I have logged this question for our operations desk. Would you like me to connect you with a human support representative or register a support ticket?`,
    suggestedQuestions: [
      'Connect with human support',
      'What materials do you accept?',
      'Check scrap prices',
      'Supported service areas',
    ],
  };
}

/**
 * 10. OPENAI TOOLS DEFINITIONS
 */
const SUPPORT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_live_materials_and_pricing',
      description:
        'Retrieve all live accepted waste materials, current rates per kg, min/max weights, and special pricing rules from the database.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_service_areas',
      description:
        'Get active service areas in Bengaluru (exclusively BTM Layout and JP Nagar), ETA, operational hours and supported locations.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_orders',
      description:
        'Retrieve real-time orders, status, arrival ETA, and payment status for the currently authenticated customer.',
      parameters: {
        type: 'object',
        properties: {
          queryOrderNumber: {
            type: 'string',
            description: 'Optional specific order number to look up',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_wallet',
      description:
        'Retrieve the authenticated customer wallet balance and recent ledger transactions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_subscription_plans',
      description:
        'Retrieve verified subscription plans (Quarterly, Six Months, Annual) and check if customer has active membership.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_disputes',
      description:
        'Retrieve the authenticated customer dispute and complaint tickets with their live status.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_pickup_estimate',
      description:
        'Calculate exact pricing and summary for specified materials and weights using the authoritative pricing engine.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                categoryName: { type: 'string' },
                weightKg: { type: 'number' },
              },
              required: ['categoryName', 'weightKg'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_support_complaint',
      description:
        'Register an official support complaint in the database and return a verified ticket reference number.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [
              'WEIGHT_DISPUTE',
              'AGENT_BEHAVIOR',
              'PAYMENT_ISSUE',
              'GENERAL_SUPPORT',
              'DELAYED_PICKUP',
            ],
          },
          description: { type: 'string', description: 'Clear description of the customer issue' },
          orderNumber: { type: 'string', description: 'Optional related order number' },
        },
        required: ['description'],
      },
    },
  },
];

/**
 * 11. MAIN SUPPORT CHAT ORCHESTRATOR
 */
export async function handleSupportChat(
  userMessage: string,
  history: ChatMessage[] = [],
  context: SupportChatContext = {}
): Promise<{ text: string; suggestedQuestions: string[]; referenceId?: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  // If no OpenAI key is configured, use the intelligent database-backed fallback engine
  if (!apiKey || apiKey.trim() === '' || apiKey === 'mock-key' || apiKey.startsWith('sk-test-')) {
    return generateFallbackSupportResponse(userMessage, context);
  }

  const publicKnowledge = await retrievePublicKnowledge(userMessage);
  const knowledgeContext = publicKnowledge
    ? `\n\nApproved public website knowledge (use only when relevant; do not override authenticated database tools):\n${publicKnowledge}`
    : '';
  const systemPrompt = `You are the friendly, professional, 24/7 AI Customer Support Representative for "Junk It Out", Bengaluru's trusted doorstep scrap and waste pickup platform.

Rules you MUST ALWAYS follow:
1. Multilingual: Understand and respond naturally in English, Kannada (ಕನ್ನಡ), and Hinglish (Hindi in English script) according to the language used by the customer.
2. STRICT SERVICE AREAS (ONLY TWO PLACES IN BENGALURU):
   - Junk It Out currently operates doorstep pickup services in ONLY TWO LOCATIONS:
     1) JP Nagar (Phases 1 to 9)
     2) BTM Layout (1st & 2nd Stage)
   - NEVER list, invent, or claim any other areas are active! Areas like Whitefield, Koramangala, Indiranagar, Electronic City, HSR Layout, Hebbal, Yelahanka, Rajajinagar, Jayanagar, etc. are STRICTLY NOT SUPPORTED currently.
   - When asked about locations or service areas, always state clearly that we serve ONLY in these two places (JP Nagar and BTM Layout), with 20–30 minute doorstep pickup.
3. Live Data Only: ALWAYS use tools to look up real pricing, accepted materials, service areas, and customer orders. NEVER invent prices, offers, order statuses, or agent phone numbers.
4. Pricing Rules:
   - Doorstep Service charge is WAIVED (FREE / ₹0). The original ₹50 is not collected.
   - Special Material Pricing: If the quantity of any individual material exceeds 7 kg, the special flat price is ₹99 for that material.
5. Wallets & Subscriptions:
   - Customers have a digital wallet used for doorstep pickups; topups are processed via Razorpay.
   - Subscription plans: Quarterly (₹299/3mo), Six Months (₹399/6mo), Annual (₹599/12mo).
6. Disputes & Refunds:
   - Disputes follow a 5-stage lifecycle: OPEN → UNDER_REVIEW → AWAITING_CUSTOMER → RESOLVED / REJECTED.
   - Weight disputes: Customers can request immediate on-spot re-weighing on calibrated digital scale.
   - Refunds: 100% automated refund on pre-arrival cancellation via Razorpay (3–5 business days).
7. Escalation:
   - If the customer asks for a human, representative, or is facing a dispute, offer to create an official complaint using the 'create_support_complaint' tool.
8. Tone: Courteous, concise, helpful, and transparent. Avoid boilerplate or robotic greetings.${knowledgeContext}`;

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  try {
    // 1st OpenAI API call with 15s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: SUPPORT_TOOLS,
        tool_choice: 'auto',
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[SUPPORT_AGENT_OPENAI_ERROR] Status: ${res.status}`);
      return generateFallbackSupportResponse(userMessage, context);
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;
    if (!choice) {
      return generateFallbackSupportResponse(userMessage, context);
    }

    // Handle tool calls if requested by OpenAI
    if (choice.tool_calls && Array.isArray(choice.tool_calls) && choice.tool_calls.length > 0) {
      messages.push(choice);
      let escalationReferenceId: string | undefined = undefined;

      for (const tc of choice.tool_calls) {
        const fnName = tc.function.name;
        let args: any = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {}

        let toolResult: any;
        if (fnName === 'get_live_materials_and_pricing') {
          toolResult = await getLiveMaterialsAndPricing();
        } else if (fnName === 'get_service_areas') {
          toolResult = await getLiveServiceAreas();
        } else if (fnName === 'get_customer_orders') {
          toolResult = await getAuthenticatedCustomerOrders(context, args.queryOrderNumber);
        } else if (fnName === 'get_customer_wallet') {
          toolResult = await getAuthenticatedCustomerWallet(context);
        } else if (fnName === 'get_subscription_plans') {
          toolResult = await getSubscriptionPlans(context);
        } else if (fnName === 'get_customer_disputes') {
          toolResult = await getAuthenticatedCustomerDisputes(context);
        } else if (fnName === 'calculate_pickup_estimate') {
          toolResult = await calculateLiveEstimate(args.items || []);
        } else if (fnName === 'create_support_complaint') {
          toolResult = await createLiveSupportComplaint(context, args);
          if (toolResult.success && toolResult.referenceNumber) {
            escalationReferenceId = toolResult.referenceNumber;
          }
        } else {
          toolResult = { error: 'Unknown tool' };
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: fnName,
          content: JSON.stringify(toolResult),
        });
      }

      // 2nd OpenAI API call to generate final response after tool execution
      const toolController = new AbortController();
      const toolTimeoutId = setTimeout(() => toolController.abort(), 15000);

      const secondRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
        }),
        signal: toolController.signal,
      });
      clearTimeout(toolTimeoutId);

      if (secondRes.ok) {
        const secondData = await secondRes.json();
        const finalText = secondData.choices?.[0]?.message?.content || '';
        return {
          text: finalText,
          suggestedQuestions: [
            'Check current scrap rates',
            'Book a doorstep pickup',
            'Where is my pickup agent?',
          ],
          referenceId: escalationReferenceId,
        };
      }
    }

    return {
      text: choice.content || 'How can I assist you with your doorstep waste pickup today?',
      suggestedQuestions: [
        'What materials do you accept?',
        'How does doorstep weighing work?',
        'Check service areas',
      ],
    };
  } catch (err: any) {
    console.warn(
      '[SUPPORT_AGENT_EXCEPTION] Falling back to intelligent local engine:',
      err?.message || err
    );
    return generateFallbackSupportResponse(userMessage, context);
  }
}
