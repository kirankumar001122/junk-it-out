import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function optimizeImages() {
  const images = [
    {
      input: path.join(process.cwd(), 'public/categories/e-waste.png'),
      output: path.join(process.cwd(), 'public/categories/e-waste.webp'),
    },
    {
      input: path.join(process.cwd(), 'public/categories/household-waste.png'),
      output: path.join(process.cwd(), 'public/categories/household-waste.webp'),
    },
    {
      input: path.join(process.cwd(), 'public/images/junk_it_out.png'),
      output: path.join(process.cwd(), 'public/images/junk_it_out.webp'),
    },
  ];

  console.log('--- INSPECTING & OPTIMIZING IMAGES ---');

  for (const item of images) {
    if (!fs.existsSync(item.input)) {
      console.warn(`File not found: ${item.input}`);
      continue;
    }

    const inputStat = fs.statSync(item.input);
    const meta = await sharp(item.input).metadata();

    console.log(`\nInput: ${path.basename(item.input)}`);
    console.log(`  Dimensions: ${meta.width}x${meta.height}, format: ${meta.format}, channels: ${meta.channels}, hasAlpha: ${meta.hasAlpha}`);
    console.log(`  Original Size: ${(inputStat.size / 1024).toFixed(1)} KB (${inputStat.size} bytes)`);

    // Optimize to WebP with transparency preservation
    await sharp(item.input)
      .webp({
        quality: 85,
        effort: 6,
        alphaQuality: 90,
      })
      .toFile(item.output);

    const outputStat = fs.statSync(item.output);
    const outMeta = await sharp(item.output).metadata();
    const savings = ((1 - outputStat.size / inputStat.size) * 100).toFixed(1);

    console.log(`Output: ${path.basename(item.output)}`);
    console.log(`  Dimensions: ${outMeta.width}x${outMeta.height}, format: ${outMeta.format}, hasAlpha: ${outMeta.hasAlpha}`);
    console.log(`  Optimized Size: ${(outputStat.size / 1024).toFixed(1)} KB (${outputStat.size} bytes)`);
    console.log(`  Savings: ${savings}% reduction!`);
  }
}

optimizeImages().catch((err) => {
  console.error('Error optimizing images:', err);
  process.exit(1);
});
