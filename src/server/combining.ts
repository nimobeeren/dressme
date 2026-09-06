import sharp from "sharp";

export async function combineWearables(
  avatarImage: Buffer,
  topImage: Buffer,
  bottomImage: Buffer,
  topMask: Buffer,
  bottomMask: Buffer,
): Promise<Buffer> {
  const avatar = sharp(avatarImage);
  const { width, height } = await avatar.metadata();
  if (!width || !height) {
    throw new Error("Could not determine avatar dimensions");
  }

  const topResized = await sharp(topImage)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  const bottomResized = await sharp(bottomImage)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  const topMaskResized = await sharp(topMask)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .greyscale()
    .png()
    .toBuffer();

  const bottomMaskResized = await sharp(bottomMask)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .greyscale()
    .png()
    .toBuffer();

  const topWithAlpha = await sharp(topResized).joinChannel(topMaskResized).png().toBuffer();

  const bottomWithAlpha = await sharp(bottomResized)
    .joinChannel(bottomMaskResized)
    .png()
    .toBuffer();

  // Compose: bottom over avatar, then top over result
  const result = await sharp(avatarImage)
    .composite([{ input: bottomWithAlpha }, { input: topWithAlpha }])
    .jpeg({ quality: 75 })
    .toBuffer();

  return result;
}
