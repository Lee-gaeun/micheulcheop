import {readFile} from 'node:fs/promises';
import {SupabaseCollaborationStore} from '../supabase-store.mjs';
try{process.loadEnvFile('.env.local');}catch(error){if(error.code!=='ENOENT')throw error;}
if(!process.argv.includes('--confirm'))throw Error('This copies local shared records and photos to Supabase. Review the destination and run with --confirm. Local files are not deleted.');
if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY first');
const state=JSON.parse(await readFile('.data/collaboration.json','utf8'));
const store=await new SupabaseCollaborationStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,bucket:process.env.SUPABASE_MEDIA_BUCKET||'micheulcheop-media'}).load();
await store.importInitialState(state);
console.log('Imported shared notebooks and media. Local files were preserved.');
