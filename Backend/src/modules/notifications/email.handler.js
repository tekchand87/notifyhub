export const handleEmail = async (event) => {
console.log(
`[PHASE 6 MOCK] Email received ${event.eventId}`
);
return {
success: true,
channel: "email",
providerResponse: "mock-email-accepted"
};
};