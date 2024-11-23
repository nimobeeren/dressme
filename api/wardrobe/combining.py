from PIL import Image
from PIL.Image import Image as ImageType


def refine_mask(human, garment_on_human, vton_mask, threshold=1000):
    # compute the difference between the two images
    mask = Image.new("L", human.size)
    for x in range(human.size[0]):
        for y in range(human.size[1]):
            r1, g1, b1 = human.getpixel((x, y))
            r2, g2, b2 = garment_on_human.getpixel((x, y))
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
    bottom_mask_im: ImageType | None = None,
):
    result = Image.new("RGB", avatar_im.size)
    # refined_mask = refine_mask(avatar_im, result_top, mask_top)
    result.paste(bottom_im, (0, 0))
    result.paste(top_im, (0, 0), top_mask_im.convert("L"))
    return result
