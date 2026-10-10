import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyFirebasePhoneToken } from "../_shared/firebase-auth.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
function client() { const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEYS"); if(!url||!key) throw new Error("Support service is not configured."); return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}); }
function message(error: unknown) { return error instanceof Error && error.message ? error.message : "Unable to update your support request. Please try again."; }

Deno.serve(async (request) => {
  if(request.method === "OPTIONS") return new Response("ok", { headers });
  if(request.method !== "POST") return reply({error:"POST required."},405);
  try {
    const token=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1]||"";
    if(!token) return reply({error:"Please sign in to continue."},401);
    const identity=await verifyFirebasePhoneToken(token); const admin=client();
    const body=await request.json().catch(()=>({})) as Record<string,unknown>; const action=typeof body.action === "string" ? body.action : "";
    if(action === "list") {
      const {data:tickets,error}=await admin.from("phone_support_tickets").select("id,subject,category,status,created_at,updated_at,resolved_at").eq("phone",identity.phone).order("updated_at",{ascending:false}).limit(50); if(error) throw error;
      const ids=(tickets||[]).map(ticket=>ticket.id); const {data:messages,error:messageError}=ids.length?await admin.from("phone_support_ticket_messages").select("id,ticket_id,sender_type,message,created_at").in("ticket_id",ids).order("created_at",{ascending:true}):{data:[],error:null}; if(messageError) throw messageError;
      const byTicket=new Map<string,unknown[]>(); for(const item of messages||[]){const list=byTicket.get(item.ticket_id)||[];list.push(item);byTicket.set(item.ticket_id,list);}
      return reply({tickets:(tickets||[]).map(ticket=>({...ticket,messages:byTicket.get(ticket.id)||[]}))});
    }
    if(action === "create") {
      const subject=typeof body.subject === "string" ? body.subject.trim().replace(/\s+/g," ") : ""; const category=typeof body.category === "string" ? body.category : ""; const text=typeof body.message === "string" ? body.message.trim() : "";
      if(subject.length<3||subject.length>120||!["account","payments","calls","safety","other"].includes(category)||text.length<1||text.length>2000) return reply({error:"Add a subject, category, and a message of up to 2,000 characters."},400);
      const {data:ticket,error}=await admin.from("phone_support_tickets").insert({phone:identity.phone,subject,category,status:"open"}).select("id").single(); if(error||!ticket) throw error||new Error("Unable to create support request.");
      const {error:insertError}=await admin.from("phone_support_ticket_messages").insert({ticket_id:ticket.id,sender_type:"member",sender_phone:identity.phone,message:text}); if(insertError) throw insertError;
      return reply({ticket_id:ticket.id});
    }
    if(action === "reply") {
      const ticketId=typeof body.ticket_id === "string" ? body.ticket_id : ""; const text=typeof body.message === "string" ? body.message.trim() : "";
      if(!ticketId||text.length<1||text.length>2000) return reply({error:"Enter a message of up to 2,000 characters."},400);
      const {data:ticket,error:ticketError}=await admin.from("phone_support_tickets").select("id,status").eq("id",ticketId).eq("phone",identity.phone).maybeSingle(); if(ticketError||!ticket) return reply({error:"This support request is no longer available."},404); if(ticket.status === "resolved") return reply({error:"This request is resolved. Please open a new request if you still need help."},400);
      const {error:insertError}=await admin.from("phone_support_ticket_messages").insert({ticket_id:ticketId,sender_type:"member",sender_phone:identity.phone,message:text}); if(insertError) throw insertError;
      const {error:updateError}=await admin.from("phone_support_tickets").update({status:"open",updated_at:new Date().toISOString()}).eq("id",ticketId); if(updateError) throw updateError;
      return reply({ok:true});
    }
    return reply({error:"Unsupported support action."},400);
  } catch(error) { console.error("Support ticket failed:",error); return reply({error:message(error)},500); }
});
