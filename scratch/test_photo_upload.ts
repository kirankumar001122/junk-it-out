import fs from 'fs';
import path from 'path';

async function testPhotoUploadApi() {
  console.log('=== TESTING PHOTO UPLOAD API (/api/upload) ===\n');

  // 1. Create dummy valid image file
  const testDir = path.join(process.cwd(), 'scratch');
  const validImgPath = path.join(testDir, 'test-image.jpg');
  // Simple 1x1 JPG buffer
  const dummyJpgBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0xbf, 0x00, 0xff, 0xd9,
  ]);
  fs.writeFileSync(validImgPath, dummyJpgBuffer);

  // Test 1: Upload single valid JPG file
  const formData1 = new FormData();
  const file1 = new File([dummyJpgBuffer], 'test-waste.jpg', { type: 'image/jpeg' });
  formData1.append('file', file1);

  const res1 = await fetch('http://localhost:3000/api/upload', {
    method: 'POST',
    body: formData1,
  });
  const data1 = await res1.json();
  console.log('Test 1 - Single JPG Photo Upload Result:');
  console.log('  Status:', res1.status);
  console.log('  Response:', data1);
  console.log('----------------------------------------------------');

  // Test 2: Upload multiple photos
  const formData2 = new FormData();
  formData2.append('files', new File([dummyJpgBuffer], 'waste-1.png', { type: 'image/png' }));
  formData2.append('files', new File([dummyJpgBuffer], 'waste-2.webp', { type: 'image/webp' }));

  const res2 = await fetch('http://localhost:3000/api/upload', {
    method: 'POST',
    body: formData2,
  });
  const data2 = await res2.json();
  console.log('Test 2 - Multiple Photos Upload Result:');
  console.log('  Status:', res2.status);
  console.log('  Response:', data2);
  console.log('----------------------------------------------------');

  // Test 3: Upload invalid file type
  const formData3 = new FormData();
  formData3.append('file', new File(['hello world'], 'script.js', { type: 'text/javascript' }));

  const res3 = await fetch('http://localhost:3000/api/upload', {
    method: 'POST',
    body: formData3,
  });
  const data3 = await res3.json();
  console.log('Test 3 - Invalid File Type Rejection Result:');
  console.log('  Status:', res3.status);
  console.log('  Response:', data3);
  console.log('----------------------------------------------------');

  // Cleanup test image
  if (fs.existsSync(validImgPath)) fs.unlinkSync(validImgPath);
}

testPhotoUploadApi().catch(console.error);
