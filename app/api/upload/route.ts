import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      const singleFile = formData.get('file') as File;
      if (singleFile) files.push(singleFile);
    }

    if (files.length === 0) {
      return NextResponse.json({ success: false, message: 'No file provided for upload.' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      const mime = file.type ? file.type.toLowerCase() : '';
      
      if (mime && !allowedTypes.includes(mime)) {
        return NextResponse.json(
          { success: false, message: `Invalid file type for ${file.name}. Only JPG, PNG, and WEBP formats are supported.` },
          { status: 400 }
        );
      }

      // Max 10MB size limit per image
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        return NextResponse.json(
          { success: false, message: `File ${file.name} exceeds maximum allowed size of 10MB.` },
          { status: 400 }
        );
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      let ext = path.extname(file.name) || '.jpg';
      if (!ext || ext === '.') ext = '.jpg';
      const filename = `waste-photo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}${ext}`;
      const filePath = path.join(uploadDir, filename);

      await writeFile(filePath, buffer);
      uploadedUrls.push(`/uploads/${filename}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Photo(s) uploaded successfully.',
      urls: uploadedUrls,
      url: uploadedUrls[0],
    });
  } catch (error: any) {
    console.error('Photo upload error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Failed to process photo upload.' },
      { status: 500 }
    );
  }
}
