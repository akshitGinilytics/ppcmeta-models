import {CampaignDataModel, UserInterface} from "@GeneralTypes";
import DataLoader from "dataloader";
import firestoreClient from "./firestoreClient.js";
import {DocumentData, DocumentSnapshot} from "firebase-admin/firestore";


async function batchUsers(userIds: Readonly<string[]>): Promise<UserInterface[]> {
  const userRefs = userIds.map(id => firestoreClient.collection("users").doc(id))
  const users = await firestoreClient.getAll(...userRefs)
  return <UserInterface[]>mapper(users, userIds)
}

async function batchTeamCampaigns(campaignIds: Readonly<string[]>): Promise<CampaignDataModel[]> {
  const campaignRefs = campaignIds.map(id => firestoreClient.collection("campaigns").doc(id))
  const campaignsSnapshot = await firestoreClient.getAll(...campaignRefs)
  return <CampaignDataModel[]>mapper(campaignsSnapshot, campaignIds)
}

async function batchUserCampaigns(campaignIds: Readonly<string[]>): Promise<CampaignDataModel[]> {
  const campaignRefs = campaignIds.map(id => {
    const [userId, customerId, campaignId] = id.split("/")
    return firestoreClient.collection("users").doc(userId)
      .collection("customers").doc(customerId)
      .collection("campaigns").doc(campaignId)
  })
  const campaignsSnapshot = await firestoreClient.getAll(...campaignRefs)
  return <CampaignDataModel[]>mapper(campaignsSnapshot, campaignIds.map(id => id.split("/")[2]))
}



export const userDataLoader = new DataLoader(batchUsers)
export const teamCampaignDataLoader = new DataLoader(batchTeamCampaigns)
export const userCampaignDataLoader = new DataLoader(batchUserCampaigns)



function mapper(snapshot: DocumentSnapshot[], docIds: Readonly<string[]>) {
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
