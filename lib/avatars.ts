import type {SupabaseClient} from '@supabase/supabase-js';

type AvatarProfile={id:string;avatar_path?:string|null;avatar_url?:string|null};
export async function signedAvatar(supabase:SupabaseClient,profile:AvatarProfile):Promise<string|null> {
  const path=profile.avatar_path;
  if(!path||!path.startsWith(`${profile.id}/`)||path.includes('..'))return null;
  try {
    const {data,error}=await supabase.storage.from('profile-avatars').createSignedUrl(path,300);
    return error?null:data?.signedUrl??null;
  }catch{return null;}
}
