# type: ignore

from PIL import Image
from PIL.Image import Image as ImageType


def refine_mask(human, wearable_on_human, vton_mask, threshold=1000):
    # compute the difference between the two images
    mask = Image.new("L", human.size)
    for x in range(human.size[0]):
        for y in range(human.size[1]):
            r1, g1, b1 = human.getpixel((x, y))
            r2, g2, b2 = wearable_on_human.getpixel((x, y))
            if ((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2) > threshold:
                mask.putpixel((x, y), 255)

    # intersect mask with vton mask
    for x in range(human.size[0]):
        for y in range(human.size[1]):
            if vton_mask.getpixel((x, y)) == 0:
                mask.putpixel((x, y), 0)

    return mask


def combine_wearables(
    avatar_im: ImageType,
    top_im: ImageType,
    bottom_im: ImageType,
    top_mask_im: ImageType,
    bottom_mask_im: ImageType,
):
    # Start with the avatar image
    result = avatar_im.copy().convert("RGB")
    size = avatar_im.size

    # Paste the bottom wearable over the avatar
    bottom_im_resized = bottom_im.resize(size, Image.LANCZOS)
    bottom_mask_resized = bottom_mask_im.convert("L").resize(size, Image.LANCZOS)
    result.paste(bottom_im_resized, (0, 0), bottom_mask_resized)

    # Paste the top wearable over both avatar and bottom
    top_im_resized = top_im.resize(size, Image.LANCZOS)
    top_mask_resized = top_mask_im.convert("L").resize(size, Image.LANCZOS)
    # refined_mask = refine_mask(avatar_im, result_top, mask_top)
    result.paste(top_im_resized, (0, 0), top_mask_resized)

    return result
