import { router } from "../../lib/router.js";
import { getDashboard } from "./dashboard.js";
import { getInsights, getReport, getTimeline } from "./insights.js";
import { createInvite, listDevices, revokeDevice, saveMemberSubscription, sendTestDose, setLadder, updateParent } from "./manage.js";
import { confirmPrescription, createPrescription, getPrescription } from "./prescriptions.js";
import { addMedicine, listParentMedicines, refillMedicine, stopMedicine, updateMedicine } from "./medicines.js";
import { acceptInvite, createFamily, getMe, setMyLanguage } from "./setup.js";

/** Family API (Cognito sign-in). Route keys must match the HTTP API routes in the stack. */
export const FAMILY_ROUTES = {
  "GET /me": getMe,
  "PUT /me/lang": setMyLanguage,
  "POST /families": createFamily,
  "POST /invites/accept": acceptInvite,
  "GET /families/{fid}": getDashboard,
  "POST /families/{fid}/invites": createInvite,
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
  "GET /families/{fid}/parents/{pid}/report": getReport,
  "GET /families/{fid}/parents/{pid}/insights": getInsights,
  "POST /families/{fid}/prescriptions": createPrescription,
  "GET /families/{fid}/prescriptions/{rxId}": getPrescription,
  "POST /families/{fid}/prescriptions/{rxId}/confirm": confirmPrescription,
  "GET /doses/{doseId}/timeline": getTimeline,
  "POST /push/subscriptions": saveMemberSubscription,
} as const;

export const handler = router(FAMILY_ROUTES);
