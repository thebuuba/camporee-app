import test from 'node:test';
import assert from 'node:assert/strict';
import {signedAvatar} from '../lib/avatars.ts';
const user='10000000-0000-4000-8000-000000000001';
test('avatars use private signed storage paths and never reuse public historical URLs',async()=>{
 const calls=[];const supabase={storage:{from(bucket){return {createSignedUrl:async(path,seconds)=>{calls.push({bucket,path,seconds});return {data:{signedUrl:'https://signed.test/avatar'},error:null};}}}}};
 assert.equal(await signedAvatar(supabase,{id:user,avatar_path:`${user}/avatar`,avatar_url:'https://public.test/avatar'}),'https://signed.test/avatar');
 assert.equal(calls[0].bucket,'profile-avatars');assert.equal(calls[0].seconds,300);
 assert.equal(await signedAvatar(supabase,{id:user,avatar_path:'another-user/avatar'}),null);
 assert.equal(await signedAvatar(supabase,{id:user,avatar_url:'https://public.test/avatar'}),null);assert.equal(calls.length,1);
});
test('avatar signing failure leaves initials available',async()=>{
 const supabase={storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{message:'Revoked'}})})}};
 assert.equal(await signedAvatar(supabase,{id:user,avatar_path:`${user}/avatar`}),null);
});
