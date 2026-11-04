import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log("Body received:", body)

    // Get phone from any field name
    let phone = body.phone || body.phoneNumber || body.adminPhone || ""
    console.log("Raw phone:", phone)

    // Remove +91, spaces, everything - keep last 10 digits
    const digits = phone.toString().replace(/\D/g, "")
    const last10 = digits.slice(-10)
    console.log("Local login check for:", last10)

    if (last10 === "8610466283" || last10 === "7676272709") {
      console.log(`✅ ALLOW LOCAL LOGIN for ${last10} with OTP 123456`)
      return NextResponse.json({ 
        success: true, 
        otp: "123456",
        message: "Local OTP is 123456" 
      })
    }

    return NextResponse.json({ error: "Not admin: " + last10 }, { status: 401 })
  } catch (err: any) {
    console.error("Admin login error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}