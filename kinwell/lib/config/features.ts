/**
 * Product scope switches. The MVP is patient-only: the doctor portal (login, dashboard, review queue,
 * knowledge management, doctor guidance in answers) is kept in the codebase but switched off unless
 * ENABLE_DOCTOR_PORTAL=true. Read at call time so tests can exercise both modes.
 */
export const features = {
  get doctorPortal() {
    return process.env.ENABLE_DOCTOR_PORTAL === "true";
  },
};
