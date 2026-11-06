Tested on: http://127.0.0.1:3000
1. send-otp - 200 OK, otp 123456
2. admin-login - 200 OK, Local OTP works
3. agent-login - 400 OTP_VERIFICATION_FAILED, fast2sms config missing
Fix needed: Add ALLOW LOCAL LOGIN to agent-login like admin-login
Field name is "code", not "otp"