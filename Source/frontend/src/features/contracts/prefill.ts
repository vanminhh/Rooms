import type { ViewingView } from '../viewings/api'

export interface ViewingContractPrefill {
  viewingId: number
  roomId: number
  buildingId: number
  roomCode: string
  signer: { fullName: string; phone: string; email?: string }
  guestAccount?: { fullName: string; phone: string }
}

// Keep personal prefill in navigation state, not in a shareable query string. The create API rechecks it.
export function viewingContractPrefill(viewing: ViewingView): ViewingContractPrefill {
  return {
    viewingId: viewing.id, roomId: viewing.roomId, buildingId: viewing.buildingId, roomCode: viewing.roomCode,
    signer: {
      fullName: viewing.guestAccount?.fullName ?? viewing.guestName,
      phone: viewing.guestAccount?.phone ?? viewing.guestPhone,
      ...(viewing.guestEmail ? { email: viewing.guestEmail } : {}),
    },
    ...(viewing.guestAccount ? { guestAccount: { fullName: viewing.guestAccount.fullName, phone: viewing.guestAccount.phone } } : {}),
  }
}
