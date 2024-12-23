// This file is auto-generated by @hey-api/openapi-ts

import { createClient, createConfig, type OptionsLegacyParser } from '@hey-api/client-fetch';
import type { GetUsersError, GetUsersResponse, GetAvatarImageData, GetAvatarImageError, GetAvatarImageResponse, GetWearablesError, GetWearablesResponse, GetWearableImageData, GetWearableImageError, GetWearableImageResponse, GetOutfitData, GetOutfitError, GetOutfitResponse, GetOutfitsError, GetOutfitsResponse, AddOutfitData, AddOutfitError, AddOutfitResponse, RemoveOutfitData, RemoveOutfitError, RemoveOutfitResponse } from './types.gen';

export const client = createClient(createConfig());

/**
 * Get Users
 */
export const getUsers = <ThrowOnError extends boolean = false>(options?: OptionsLegacyParser<unknown, ThrowOnError>) => {
    return (options?.client ?? client).get<GetUsersResponse, GetUsersError, ThrowOnError>({
        ...options,
        url: '/users'
    });
};

/**
 * Get Avatar Image
 */
export const getAvatarImage = <ThrowOnError extends boolean = false>(options: OptionsLegacyParser<GetAvatarImageData, ThrowOnError>) => {
    return (options?.client ?? client).get<GetAvatarImageResponse, GetAvatarImageError, ThrowOnError>({
        ...options,
        url: '/images/avatars/{avatar_image_id}'
    });
};

/**
 * Get Wearables
 */
export const getWearables = <ThrowOnError extends boolean = false>(options?: OptionsLegacyParser<unknown, ThrowOnError>) => {
    return (options?.client ?? client).get<GetWearablesResponse, GetWearablesError, ThrowOnError>({
        ...options,
        url: '/wearables'
    });
};

/**
 * Get Wearable Image
 */
export const getWearableImage = <ThrowOnError extends boolean = false>(options: OptionsLegacyParser<GetWearableImageData, ThrowOnError>) => {
    return (options?.client ?? client).get<GetWearableImageResponse, GetWearableImageError, ThrowOnError>({
        ...options,
        url: '/images/wearables/{wearable_image_id}'
    });
};

/**
 * Get Outfit
 */
export const getOutfit = <ThrowOnError extends boolean = false>(options: OptionsLegacyParser<GetOutfitData, ThrowOnError>) => {
    return (options?.client ?? client).get<GetOutfitResponse, GetOutfitError, ThrowOnError>({
        ...options,
        url: '/images/outfit'
    });
};

/**
 * Get Outfits
 */
export const getOutfits = <ThrowOnError extends boolean = false>(options?: OptionsLegacyParser<unknown, ThrowOnError>) => {
    return (options?.client ?? client).get<GetOutfitsResponse, GetOutfitsError, ThrowOnError>({
        ...options,
        url: '/outfits'
    });
};

/**
 * Add Outfit
 */
export const addOutfit = <ThrowOnError extends boolean = false>(options: OptionsLegacyParser<AddOutfitData, ThrowOnError>) => {
    return (options?.client ?? client).post<AddOutfitResponse, AddOutfitError, ThrowOnError>({
        ...options,
        url: '/outfits'
    });
};

/**
 * Remove Outfit
 */
export const removeOutfit = <ThrowOnError extends boolean = false>(options: OptionsLegacyParser<RemoveOutfitData, ThrowOnError>) => {
    return (options?.client ?? client).delete<RemoveOutfitResponse, RemoveOutfitError, ThrowOnError>({
        ...options,
        url: '/outfits'
    });
};