'use client';
export default function AdminPage() {
  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>✅ Admin Dashboard - Local Mode</h1>
      <p style={{ marginTop: '10px', color: 'green' }}>You are logged in without DB! OTP bypass working!</p>
      
      <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
        <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>Users: --</div>
        <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>Orders: --</div>
        <div style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>Revenue: --</div>
      </div>

      <p style={{ marginTop: '30px' }}>DB will be connected later for real data. UI work can continue now.</p>
    </div>
  )
}