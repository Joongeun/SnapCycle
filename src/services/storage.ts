import { supabase } from './supabase';

const BUCKET = 'item-photos';

/**
 * Uploads a base64 JPEG to the user's own folder in Supabase Storage and
 * returns the public URL. The folder name is the user id, matching the
 * storage RLS policy (a user can only write into their own folder).
 */
export async function uploadItemPhoto(userId: string, base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = `${userId}/${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
