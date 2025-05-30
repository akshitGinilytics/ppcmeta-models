import {DocumentData, DocumentSnapshot} from "firebase-admin/firestore";
import {QuerySnapshot} from "firebase-admin/firestore";


export const extractCustomerIds = (data: { customerId: string }[] | QuerySnapshot<DocumentData>) => {
  const result: Set<string> = new Set()
  if (data instanceof QuerySnapshot) {
    data.forEach((doc) => result.add(doc.data().customerId))
  } else {
    data.forEach((doc) => result.add(doc.customerId))
  }
  return result
}

export const extractCampaignIds = (data: { campaignId: string }[]) => {
  return new Set(data.map(({campaignId}) => campaignId))
}


export function mapper(snapshot: DocumentSnapshot[], docIds: Readonly<string[]>) {
  const dictionary: Record<string, DocumentData> = {}
  for (let i = 0; i < snapshot.length; i++) {
    const document = snapshot[i].data()
    if (!document) {
      continue
    }
    dictionary[snapshot[i].id] = document
  }
  return docIds.map((id) => dictionary[id] ?? null)
}