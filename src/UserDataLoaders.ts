import firestoreClient from "./firestoreClient.js";
import User from "./User.js";
import {UserCustomer} from "./Customer.js";
import {CampaignDataModel} from "@GeneralTypes";
import {UserCampaign} from "./Campaign.js";
import DataLoader from "dataloader"
import {mapper} from "./helper.js";


export default class UserDataLoaders {
  private userId: string
  userCustomersCampaigns: {[customerId: string]: UserCampaign[]} = {}
  user: DataLoader<string, User | null>
  userCampaign: DataLoader<string, UserCampaign | null>
  userCustomer: DataLoader<string, UserCustomer | null>
  userCustomersIds: string[] = []

  constructor(userId: string) {
    this.userId = userId
    this.user = new DataLoader(this.batchUsers)
    this.userCustomer = new DataLoader(this.batchUserCustomers.bind(this))
    this.userCampaign = new DataLoader(this.batchUserCampaigns.bind(this))
  }

  setUserId(userId:string) {
    this.userId = userId
  }


  async batchUsers(userIds: Readonly<string[]>) {
    const userRefs = userIds.map(id => firestoreClient.collection("users").doc(id))
    console.log("userRefs", userRefs.map(ref => ref.path))
    const users = await firestoreClient.getAll(...userRefs)
    return mapper(users, userIds).map((userData) => {
      if (!userData) {
        return null
      }
      const user = new User(this, userData.userId)
      user.setAttributes(userData)
      return user
    })
  }

  async batchUserCustomers(customersIds: Readonly<string[]>) {
    const customerRefs = customersIds.map(customerId => {
      console.log("userId, customerId", this.userId, customerId)
      return firestoreClient.collection("users").doc(this.userId)
        .collection("customers").doc(customerId)
    })
    console.log("customerRefs", customerRefs)
    const customersSnapshot = await firestoreClient.getAll(...customerRefs)
    return mapper(customersSnapshot, customersIds).map((customerData) => {
      if (!customerData) {
        return null
      }
      const customer = new UserCustomer(this,this.userId, customerData.customerId)
      customer.setAttributes(customerData)
      return customer
    })
  }

  async batchUserCampaigns(campaignIds: Readonly<string[]>) {
    const campaignRefs = campaignIds.map(id => {
      const [customerId, campaignId] = id.split("/")
      console.log("userId, customerId, campaignId", this.userId, customerId, campaignId)
      return firestoreClient.collection("users").doc(this.userId)
        .collection("customers").doc(customerId)
        .collection("campaigns").doc(campaignId)
    })
    const campaignsSnapshot = await firestoreClient.getAll(...campaignRefs)
    const campaigns = <(CampaignDataModel | null)[]>mapper(campaignsSnapshot, campaignIds.map(id => id.split("/")[1]))
    return campaigns.map((campaignData) => {
      if (!campaignData) {
        return null
      }
      const campaign = new UserCampaign(this,this.userId, campaignData.customerId, campaignData.campaignId)
      campaign.setAttributes(campaignData)
      return campaign
    })
  }

  async getUserCustomers() {
    if (this.userCustomersIds) {
      return this.userCustomer.loadMany(this.userCustomersIds)
    }
    const customersSnapshot = await firestoreClient.collection("users").doc(this.userId).collection("customers").get()
    customersSnapshot.forEach(customerDoc => {
      this.userCustomersIds.push(customerDoc.id)
      const customer = new UserCustomer(this,this.userId, customerDoc.id)
      customer.setAttributes(customerDoc.data())
      this.userCustomer.prime(customerDoc.id, customer)
    })
    return this.userCustomer.loadMany(this.userCustomersIds)
  }

  async getUserCustomerCampaigns(customerId: string) {
    if (this.userCustomersCampaigns[customerId]) {
      return this.userCustomersCampaigns[customerId]
    }
    const campaignsSnapshot = await firestoreClient.collection("users").doc(this.userId)
      .collection("customers").doc(customerId).collection("campaigns").get()
    this.userCustomersCampaigns[customerId] = campaignsSnapshot.docs.map(campaignDoc => {
      const campaign = new UserCampaign(this, this.userId, customerId, campaignDoc.id)
      campaign.setAttributes(campaignDoc.data())
      this.userCampaign.prime(`${campaign.customerId}/${campaign.campaignId}`, campaign)
      return campaign
    })
    return this.userCustomersCampaigns[customerId]
  }
}
