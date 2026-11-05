import { db } from '@/lib/db';
import { calculatePickupSummary, calculateMaterialItemAmount, SPECIAL_MATERIAL_THRESHOLD_KG, SPECIAL_MATERIAL_OFFER_PRICE, PICKUP_SERVICE_CHARGE, ORIGINAL_PICKUP_SERVICE_CHARGE } from '@/lib/pricing';

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

export function checkSupportRateLimit(clientKey: string): { allowed: boolean; remaining: number; resetInSeconds: number } {
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
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetInSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetInSeconds: Math.ceil((record.resetTime - now) / 1000) };
  }

  record.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count, resetInSeconds: Math.ceil((record.resetTime - now) / 1000) };
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
  } catch (err: any) {
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
      message: 'You need to be logged in to view your orders. Please log in with your phone number on our website.',
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
        agent: {
          select: {
            vehicleType: true,
            rating: true,
            user: { select: { name: true, phone: true } },
          },
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
        const isCompleted = o.status === 'COMPLETED' || o.status === 'SETTLEMENT_COMPLETED' || o.status === 'CANCELLED';
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
          agent: o.agent
            ? {
                name: o.agent.user.name,
                // Redact agent phone after completion for customer privacy
                phone: isCompleted ? '[Hidden after completion]' : o.agent.user.phone,
                vehicleType: o.agent.vehicleType,
                rating: o.agent.rating,
              }
            : null,
        };
      }),
    };
  } catch (err: any) {
    return {
      success: false,
      authenticated: true,
      message: 'Failed to retrieve orders from database.',
      orders: [],
    };
  }
}

/**
 * 4. CREATE SUPPORT COMPLAINT / ESCALATION TICKET
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

      return {
        success: true,
        ticketId: complaint.id,
        referenceNumber: `JIO-${complaint.id.slice(0, 8).toUpperCase()}`,
        status: 'OPEN',
        message: `Your complaint has been successfully registered under ticket reference JIO-${complaint.id.slice(0, 8).toUpperCase()}. Our support team will review it within 2 hours.`,
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

      return {
        success: true,
        ticketId: enquiry.id,
        referenceNumber: `JIO-ENQ-${enquiry.id.slice(0, 8).toUpperCase()}`,
        status: 'OPEN',
        message: `Your enquiry has been registered under ticket reference JIO-ENQ-${enquiry.id.slice(0, 8).toUpperCase()}. Please log in for personalized order tracking.`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: 'Could not create complaint record at this time.',
    };
  }
}

/**
 * 5. CALCULATE LIVE PICKUP ESTIMATE
 */
export async function calculateLiveEstimate(items: Array<{ categoryName: string; weightKg: number }>) {
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
 * 6. DETERMINISTIC INTELLIGENT FALLBACK ENGINE
 * Handles English, Kannada (ಕನ್ನಡ), and Hinglish queries when OpenAI API key is unavailable or fails.
 */
export async function generateFallbackSupportResponse(
  userQuery: string,
  context: SupportChatContext
): Promise<{ text: string; suggestedQuestions: string[] }> {
  const q = userQuery.toLowerCase().trim();

  // 1. Language detection
  const isKannada = /[\u0C80-\u0CFF]/.test(userQuery);
  const isHinglish =
    /\b(kya|hai|kitna|kaise|karo|batao|karenge|mujhe|mera|meri|paisa|rate|bhav|daam|chahiye|kab|aayega|aayegi|cancel|order|kaha|kahan)\b/i.test(
      userQuery
    );

  // 2. Payments, Refunds, and Razorpay (Handled prior to order tracking to prevent refund/cancellation queries routing to tracking)
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
        ? `ಪಾವತಿ ಮತ್ತು ಮರುಪಾವತಿ ನಿಯಮಗಳು:\n• ಗ್ರಾಹಕ ಪಾವತಿಗಳು: Razorpay ಮೂಲಕ UPI, ಕಾರ್ಡ್‌ಗಳು ಅಥವಾ ನೆಟ್‌ಬ್ಯಾಂಕಿಂಗ್ ಬಳಸಿ ಸುರಕ್ಷಿತವಾಗಿ ನಡೆಯುತ್ತವೆ.\n• ರದ್ದುಗೊಳಿಸಿದ ಆರ್ಡರ್ ಮರುಪಾವತಿ: ನೀವು ಪಿಕಪ್‌ಗೆ ಮುನ್ನ ರದ್ದುಗೊಳಿಸಿದರೆ, 100% ಮರುಪಾವತಿ 3–5 ವ್ಯವಹಾರ ದಿನಗಳಲ್ಲಿ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆಗೆ ಜಮೆಯಾಗುತ್ತದೆ.\n• ಸ್ಕ್ರ್ಯಾಪ್ ಪಾವತಿಗಳು (Payouts): ನಿಜವಾದ ತೂಕದ ಆಧಾರದ ಮೇಲೆ ನಿಮ್ಮ ಖಾತೆಗೆ NEFT/UPI ಮೂಲಕ ವರ್ಗಾಯಿಸಲಾಗುತ್ತದೆ.`
        : isHinglish
        ? `Payments aur Refunds ki jankari:\n• Booking Payment: Razorpay se UPI/Cards/NetBanking ke through safely pay kar sakte hain.\n• Cancellation & Refund: Agar aap arrival se pehle cancel karte hain, toh 100% refund automatically trigger hota hai aur 3-5 days me original account me aa jata hai.\n• Doorstep Weighing: Calibrated digital scale se exact weight hone ke baad payment settle hota hai.`
        : `Payments & Refunds at Junk It Out:\n• Booking Payments: Processed securely via Razorpay checkout supporting UPI, Credit/Debit Cards, and NetBanking.\n• Cancellation & Refunds: If you cancel before the agent arrives, a 100% automated refund is initiated and credited to your original payment method within 3–5 business days.\n• Scrap Settlement: If your recyclable value exceeds service charges, scrap payouts are disbursed directly via verified UPI or bank transfer.\n• Verified Records: We never claim a payment succeeded without database confirmation.`,
      suggestedQuestions: ['Where is my pickup agent?', 'Raise a dispute / complaint', 'Current scrap rates'],
    };
  }

  // 3. Order Tracking
  if (
    (q.includes('order') ||
      q.includes('track') ||
      q.includes('status') ||
      q.includes('agent') ||
      q.includes('where is') ||
      q.includes('arrive') ||
      q.includes('kahan hai') ||
      q.includes('order status') ||
      (isKannada && (q.includes('ಆರ್ಡರ್') || q.includes('ಸ್ಥಿತಿ') || q.includes('ಏಜೆಂಟ್'))))
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

  // 3. Pricing / Rates
  if (
    q.includes('price') ||
    q.includes('pricing') ||
    q.includes('rate') ||
    q.includes('how much') ||
    q.includes('per kg') ||
    q.includes('offer') ||
    q.includes('7 kg') ||
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
        suggestedQuestions: ['E-waste collect karte ho?', 'Pickup kaise book karein?', 'Minimum quantity kitni hai?'],
      };
    }

    return {
      text: `Here are our current live material rates retrieved directly from the Junk It Out database:\n${materialSummary}\n\n✨ Special Material Pricing Rule: If the quantity of any individual material exceeds 7 kg, the special ₹99 offer price applies to that material.\n🎉 Doorstep Service Charge: The standard ₹50 service charge is currently WAIVED (FREE / ₹0), so you only pay for your materials!`,
      suggestedQuestions: ['Do you collect e-waste?', 'How do I book a pickup?', 'What is the minimum weight?'],
    };
  }

  // 4. Accepted & Non-Accepted Materials
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

  // 5. Service Areas & Locations (Strictly ONLY TWO Places: BTM Layout and JP Nagar)
  if (
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
    (isKannada && (q.includes('ಪ್ರದೇಶ') || q.includes('ಎಲ್ಲಿ') || q.includes('ಸ್ಥಳ')))
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

  // 6. Complaints & Escalations
  if (
    q.includes('complaint') ||
    q.includes('dispute') ||
    q.includes('escalate') ||
    q.includes('human') ||
    q.includes('representative') ||
    q.includes('problem') ||
    q.includes('help me') ||
    q.includes('shikayat') ||
    (isKannada && (q.includes('ದೂರು') || q.includes('ಸಮಸ್ಯೆ')))
  ) {
    return {
      text: isKannada
        ? `ನಾವು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ಸಿದ್ಧರಿದ್ದೇವೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಸಮಸ್ಯೆಯ ವಿವರಗಳನ್ನು (ಉದಾ: ತೂಕ ವಿವಾದ, ಏಜೆಂಟ್ ವಿಳಂಬ, ಅಥವಾ ಪಾವತಿ ತೊಂದರೆ) ಇಲ್ಲಿ ಟೈಪ್ ಮಾಡಿ. ನಾನು ತಕ್ಷಣವೇ ಸಿಸ್ಟಮ್‌ನಲ್ಲಿ ದೂರು ದಾಖಲಿಸಿ ರೆಫರೆನ್ಸ್ ಸಂಖ್ಯೆಯನ್ನು ನೀಡುತ್ತೇನೆ.`
        : isHinglish
        ? `Main aapki turant madad kar sakta hoon. Kripya apni issue ki details (jaise weight dispute, agent delay, ya payment issue) share karein. Main database me formal support complaint generate karke aapko reference number de dunga.`
        : `I am here to help you resolve any issue immediately. Please briefly describe your issue (e.g. weight dispute, agent delay, payment problem), and I will log an official support complaint and give you an active reference ticket number for our human operations team.`,
      suggestedQuestions: ['Log a weight dispute', 'Log a payment issue', 'Contact details & timings'],
    };
  }

  // 8. General Greetings / Default Fallback
  return {
    text: isKannada
      ? `ನಮಸ್ಕಾರ! ನಾನು Junk It Out ನ ಅಧಿಕೃತ AI ಗ್ರಾಹಕ ಬೆಂಬಲ ಸಹಾಯಕ. ನಾನು ತ್ಯಾಜ್ಯ ಸಂಗ್ರಹಣೆ ದರಗಳು, ಬುಕಿಂಗ್, ಆರ್ಡರ್ ಟ್ರ್ಯಾಕಿಂಗ್, ಮತ್ತು ದೂರುಗಳಿಗೆ ಸಂಬಂಧಿಸಿದ ಪ್ರಶ್ನೆಗಳಿಗೆ 24/7 ಸಹಾಯ ಮಾಡಬಲ್ಲೆ. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?`
      : isHinglish
      ? `Namaste! Main Junk It Out ka AI customer support agent hoon. Main live scrap pricing, doorstep pickup booking, order tracking aur support complaints me aapki 24/7 help kar sakta hoon. Aaj main aapki kya madad kar sakta hoon?`
      : `Hello! I am your 24/7 Junk It Out Customer Support Assistant. I can help you with live scrap material rates, doorstep pickup bookings, real-time order tracking, Razorpay payment queries, and support ticket escalations. How can I assist you today?`,
    suggestedQuestions: [
      'What materials do you accept & what are the rates?',
      'How do I book a doorstep pickup?',
      'Where is my pickup agent?',
      'Explain the ₹99 offer and waived service charge',
    ],
  };
}

/**
 * 7. OPENAI TOOLS DEFINITIONS
 */
const SUPPORT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_live_materials_and_pricing',
      description: 'Retrieve all live accepted waste materials, current rates per kg, min/max weights, and special pricing rules from the database.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_service_areas',
      description: 'Get active service areas in Bengaluru (exclusively BTM Layout and JP Nagar), ETA, operational hours and supported locations.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_orders',
      description: 'Retrieve real-time orders, status, arrival ETA, and payment status for the currently authenticated customer.',
      parameters: {
        type: 'object',
        properties: {
          queryOrderNumber: { type: 'string', description: 'Optional specific order number to look up' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_pickup_estimate',
      description: 'Calculate exact pricing and summary for specified materials and weights using the authoritative pricing engine.',
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
      description: 'Register an official support complaint in the database and return a verified ticket reference number.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['WEIGHT_DISPUTE', 'AGENT_BEHAVIOR', 'PAYMENT_ISSUE', 'GENERAL_SUPPORT', 'DELAYED_PICKUP'],
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
 * 8. MAIN SUPPORT CHAT ORCHESTRATOR
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
5. Security & Isolation:
   - When checking orders, ONLY retrieve the authenticated customer's own orders.
   - If the user asks about an order but is not logged in, politely prompt them to log in.
   - Never reveal agent personal phone numbers after an order is completed, and never disclose vehicle registration numbers.
6. Escalation:
   - If the customer is facing a weight dispute, payment delay, or agent issue, offer to create an official complaint using the 'create_support_complaint' tool.
   - Always return the real ticket reference number returned by the tool.
7. Tone: Courteous, concise, helpful, and transparent. Avoid boilerplate or robotic greetings.`;

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
        } else if (fnName === 'calculate_pickup_estimate') {
          toolResult = await calculateLiveEstimate(args.items || []);
        } else if (fnName === 'create_support_complaint') {
          toolResult = await createLiveSupportComplaint(context, args);
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
    console.warn('[SUPPORT_AGENT_EXCEPTION] Falling back to intelligent local engine:', err?.message || err);
    return generateFallbackSupportResponse(userMessage, context);
  }
}
