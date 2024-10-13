from PIL import Image


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


def combine_garments(human, result_top, result_bottom, mask_top, mask_bottom=None):
    result = Image.new("RGB", human.size)
    # refined_mask = refine_mask(human, result_top, mask_top)
    result.paste(result_bottom, (0, 0))
    result.paste(result_top, (0, 0), mask_top)
    return result
