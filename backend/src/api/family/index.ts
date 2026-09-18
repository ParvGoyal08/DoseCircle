import { router } from "../../lib/router.js";
import { addCheck, addReading, deleteReading, getReadings, listParentChecks, stopCheck, updateCheck } from "./checks.js";
import { getDashboard } from "./dashboard.js";
import { getInsights, getReport, getTimeline } from "./insights.js";
import { createInvite, listDevices, revokeDevice, saveMemberSubscription, sendTestDose, setLadder, updateParent } from "./manage.js";
import { deleteFamily, leaveFamily, listFamilyMembers, removeMember, updateMember } from "./members.js";
import { confirmPrescription, createPrescription, getPrescription } from "./prescriptions.js";
import { addMedicine, listParentMedicines, refillMedicine, stopMedicine, updateMedicine } from "./medicines.js";
import { acceptInvite, addParent, createFamily, getMe, setMyLanguage } from "./setup.js";

/** Family API (Cognito sign-in). Route keys must match the HTTP API routes in the stack. */
export const FAMILY_ROUTES = {
  "GET /me": getMe,
  "PUT /me/lang": setMyLanguage,
  "POST /families": createFamily,
  "POST /invites/accept": acceptInvite,
  "GET /families/{fid}": getDashboard,
  "DELETE /families/{fid}": deleteFamily,
  "POST /families/{fid}/invites": createInvite,
  "GET /families/{fid}/members": listFamilyMembers,
  "PATCH /families/{fid}/members/{mid}": updateMember,
  "DELETE /families/{fid}/members/{mid}": removeMember,
  "POST /families/{fid}/leave": leaveFamily,
  "POST /families/{fid}/parents": addParent,
  "PUT /families/{fid}/parents/{pid}/ladder": setLadder,
  "PATCH /families/{fid}/parents/{pid}": updateParent,
  "POST /families/{fid}/parents/{pid}/test-dose": sendTestDose,
  "GET /families/{fid}/parents/{pid}/devices": listDevices,
  "DELETE /families/{fid}/parents/{pid}/devices/{deviceId}": revokeDevice,
  "GET /families/{fid}/parents/{pid}/medicines": listParentMedicines,
  "POST /families/{fid}/parents/{pid}/medicines": addMedicine,
  "PATCH /families/{fid}/parents/{pid}/medicines/{medId}": updateMedicine,
  "DELETE /families/{fid}/parents/{pid}/medicines/{medId}": stopMedicine,
  "POST /families/{fid}/parents/{pid}/medicines/{medId}/refill": refillMedicine,
  "GET /families/{fid}/parents/{pid}/checks": listParentChecks,
  "POST /families/{fid}/parents/{pid}/checks": addCheck,
  "PATCH /families/{fid}/parents/{pid}/checks/{checkId}": updateCheck,
  "DELETE /families/{fid}/parents/{pid}/checks/{checkId}": stopCheck,
  "GET /families/{fid}/parents/{pid}/readings": getReadings,
  "POST /families/{fid}/parents/{pid}/readings": addReading,
  "DELETE /families/{fid}/parents/{pid}/readings/{at}/{checkId}": deleteReading,
  "GET /families/{fid}/parents/{pid}/report": getReport,
  "GET /families/{fid}/parents/{pid}/insights": getInsights,
  "POST /families/{fid}/prescriptions": createPrescription,
  "GET /families/{fid}/prescriptions/{rxId}": getPrescription,
  "POST /families/{fid}/prescriptions/{rxId}/confirm": confirmPrescription,
  "GET /doses/{doseId}/timeline": getTimeline,
  "POST /push/subscriptions": saveMemberSubscription,
} as const;

export const handler = router(FAMILY_ROUTES);
