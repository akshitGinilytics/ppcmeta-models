import {Timestamp} from "firebase-admin/firestore"
import firestoreClient from "./firestoreClient.js"
import Team from "./Team.js"
import {BigBatch} from "@qualdesk/firestore-big-batch"
import TeamDataLoaders from "./TeamDataLoaders.js"
import UserDataLoaders from "./UserDataLoaders.js"
import {TeamCampaign, UserCampaign} from "./Campaign.js"
import {CustomerDataModel, CampaignDataModel, CampaignsByCustomer} from "@GeneralTypes"
import {CampaignSettings, CustomerSettings, GoogleAdsCustomer} from "@GraphqlTypes";

class Customer implements CustomerDataModel {
  protected readonly _customerId: string
  protected _teamId = ""
  level = -1
  isManager = false
  loginCustomerId = ""
  name = ""
  currency = ""
  timeZone = ""
  resourceName = ""
  lastUpdated: Timestamp | undefined
  managerIds: string[] = []
  managerCount = 0
  ownerId = ""
  dataLoader: TeamDataLoaders | UserDataLoaders

  constructor(dataLoader: TeamDataLoaders | UserDataLoaders, customerId: string) {
    this._customerId = customerId
    this.dataLoader = dataLoader
  }

  get customerId() {
    return this._customerId
  }

  get teamId() {
    return this._teamId
  }

  private set teamId(teamId: string) {
    this._teamId = teamId
  }

  toJson(): CustomerDataModel {
    return {
      managerCount: this.managerCount,
      teamId: this.teamId,
      ownerId: this.ownerId,
      currency: this.currency,
      customerId: this.customerId,
      isManager: false,
      loginCustomerId: this.loginCustomerId,
      level: this.level,
      managerIds: this.managerIds,
      name: this.name,
      resourceName: this.resourceName,
      timeZone: this.timeZone,
      lastUpdated: this.lastUpdated
    }
  }

  setAttributes(attributes: Partial<CustomerDataModel>) {
    const customer = {...this.toJson(), ...attributes}
    this.name = customer.name
    this.currency = customer.currency
    this.isManager = customer.isManager
    this.managerIds = customer.managerIds
    this.level = customer.level
    this.timeZone = customer.timeZone
    this.resourceName = customer.resourceName
    this.lastUpdated = customer.lastUpdated
    this.loginCustomerId = customer.loginCustomerId
    this.managerCount = customer.managerCount
    this.teamId = customer.teamId
    this.ownerId = customer.ownerId
  }

  private static __addCampaignsToBatch(campaigns: UserCampaign[], team: Team, batch: FirebaseFirestore.WriteBatch, campaignsByCustomer: CampaignsByCustomer) {
    campaigns.forEach((campaign) => {
      const campaignSettingRef = firestoreClient.collection("teams").doc(team.teamId)
        .collection('campaignsSettings').doc(campaign.campaignId)
      const campaignSetting: CampaignSettings = {
        campaignId: campaign.campaignId,
        customerId: campaign.customerId,
        isAdded: true,
        thisMonthBudget: this.getDefaultersMonthBudget(campaign.campaignBudget.amount_micros),
      }
      batch.set(campaignSettingRef, campaignSetting)
      const campaignRef = firestoreClient.collection("campaigns").doc(campaign.campaignId)
      const campaignData: CampaignDataModel = {
        ...campaign.toJson(),
        teamId: team.teamId,
        ownerId: team.ownerId,
      }
      batch.set(campaignRef, campaignData)
      if (!campaignsByCustomer[campaign.customerId]) {
        campaignsByCustomer[campaign.customerId] = [campaign.campaignId]
      } else if (!campaignsByCustomer[campaign.customerId].includes(campaign.campaignId)) {
        campaignsByCustomer[campaign.customerId].push(campaign.campaignId)
      }
    })
  }
  // multiply by 30 to get monthly budget then round to nearest 50000
  private static getDefaultersMonthBudget(amountMicros: number) {
    return Math.round(amountMicros * 30 / 50) * 50
  }

  static async addCampaigns(team: Team, campaigns: UserCampaign[]) {
    const campaignsByCustomer: CampaignsByCustomer = team.campaignsByCustomer
    const batch = firestoreClient.batch()
    this.__addCampaignsToBatch(campaigns, team, batch, campaignsByCustomer)
    team.campaignsCount = campaignsByCustomer ? Object.values(campaignsByCustomer).reduce((acc, val) => acc + val.length, 0) : 0
    team.campaignsByCustomer = campaignsByCustomer
    batch.update(firestoreClient.collection("teams").doc(team.teamId), {
      campaignsByCustomer,
      campaignsCount: team.campaignsCount
    })
    team.clearCache()
    return batch.commit()
  }

  static async removeCampaigns(team: Team, campaignsByCustomer: CampaignsByCustomer) {
    if (!campaignsByCustomer) {
      return
    }
    await team.getTeam()
    console.log("removeCampaigns", campaignsByCustomer)
    const batch = new BigBatch({firestore: firestoreClient})
    for (const customerId in campaignsByCustomer) {
      const campaigns = campaignsByCustomer[customerId]
      campaigns.forEach(campaignId => {
        const campaignSettingRef = firestoreClient.collection("teams").doc(team.teamId).collection("campaignsSettings").doc(campaignId)
        batch.delete(campaignSettingRef)
        const campaignRef = firestoreClient.collection("campaigns").doc(campaignId)
        batch.delete(campaignRef)
        team.campaignsByCustomer[customerId] = team.campaignsByCustomer[customerId].filter(id => id !== campaignId)
      })
      if (team.campaignsByCustomer[customerId].length === 0) {
        delete team.campaignsByCustomer[customerId]
      }
      team.campaignsCount = Object.values(team.campaignsByCustomer).reduce((acc, val) => acc + val.length, 0)
      batch.update(firestoreClient.collection("teams").doc(team.teamId), {
        campaignsByCustomer: team.campaignsByCustomer,
        campaignsCount: team.campaignsCount
      })
    }
    team.clearCache()
    await batch.commit()
  }

  async removeCampaigns(team: Team, campaignsByCustomer: CampaignsByCustomer) {
    return await Customer.removeCampaigns(team, campaignsByCustomer)
  }

}

export class TeamCustomer extends Customer {
  protected _teamId: string
  dataLoader: TeamDataLoaders
  campaigns: TeamCampaign[] = []

  constructor(dataLoader: TeamDataLoaders, teamId: string, customerId: string) {
    super(dataLoader, customerId)
    this._teamId = teamId
    this.dataLoader = dataLoader
  }

  get teamId() {
    return this._teamId
  }

  private set teamId(teamId: string) {
    this._teamId = teamId
  }

  async getCustomer() {
    const customerRef = firestoreClient.collection("customers").doc(this.customerId)
    const customerSnapshot = await customerRef.get()
    return customerSnapshot.data()
  }

  static async getCustomersByIds(customersIds: string[] | Set<string>, teamId: string, dataLoader: TeamDataLoaders) {
    const customers = await dataLoader.teamCustomer.loadMany(Array(...customersIds))
    return customers.filter((customer) => customer !== null) as TeamCustomer[]
  }

  async getCustomerSettings() {
    const result: CustomerSettings[] = []
    const reference = firestoreClient.collection("teams").doc(this.teamId).collection("customersSettings")
    const campaignSettingsSnapshot = await reference
      .where("isAdded", "==", true)
      .where("customerId", "==", this.customerId)
      .get()
    campaignSettingsSnapshot.forEach((campaignSetting) => {
      result.push(<CustomerSettings>campaignSetting.data())
    })
    return result
  }

  async getCampaignsSettings() {
    const result: CampaignSettings[] = []
    const query = firestoreClient.collection("teams").doc(this.teamId)
      .collection("campaignsSettings")
      .where("isAdded", "==", true)
      .where("customerId", "==", this.customerId)
    const campaignSettingsSnapshot = await query.get()
    campaignSettingsSnapshot.forEach((campaignSetting) => {
      result.push(<CampaignSettings>campaignSetting.data())
    })
    console.log("campaignSettingsSnapshot", result)
    return result
  }

  async getCampaignsSettingsByIds(settingsIds: string[] | Set<string>) {
    const result = await this.dataLoader.teamCampaignSettings.loadMany(Array(...settingsIds))
    return result.filter((campaign) => campaign !== null) as CampaignSettings[]
  }

  async getCampaigns() {
    this.campaigns = await this.dataLoader.getCustomersCampaigns(this.customerId)
    return this.campaigns || []
  }

  static async batchDeleteCustomersFromTeam(customers: TeamCustomer[], team: Team) {
    await Promise.all([customers.map(async (customer) => customer.getCustomer()), team.getTeam()])
    const batch = new BigBatch({firestore: firestoreClient})
    // updating customer collection by either removing the document or removing the team from the teams array
    customers.forEach((customer) => {
      const customerRef = firestoreClient.collection("customers").doc(customer.customerId)
      batch.delete(customerRef)
      // setting isAdded to false in the team's customersSettings collection
      const customerSettingsRef = firestoreClient.collection("teams").doc(team.teamId).collection("customersSettings").doc(customer.customerId)
      batch.update(customerSettingsRef, {isAdded: false})
    })
    await batch.commit()
  }
}


export class UserCustomer extends Customer {
  private readonly _userId: string

  constructor(dataLoader: UserDataLoaders, userId: string, customerId: string) {
    super(dataLoader, customerId)
    this._userId = userId
    this.dataLoader = dataLoader
  }

  get userId() {
    return this._userId
  }

  async getCustomer() {
    const customerRef = firestoreClient.collection("users").doc(this.userId).collection("customers").doc(this.customerId)
    const customerSnapshot = await customerRef.get()
    return customerSnapshot.data()
  }

  async getCampaigns() {
    console.log("Customer Id:", this.customerId)
    const campaignsRef = firestoreClient.collection("users").doc(this.userId).collection("customers").doc(this.customerId).collection("campaigns")
    const campaignsSnapshot = await campaignsRef.get()
    const campaigns: CampaignDataModel[] = []
    campaignsSnapshot.forEach((campaign) => {
      campaigns.push(<CampaignDataModel>campaign.data())
    })
    return campaigns
  }

  static async getUserCustomers(userId: string) {
    const customerRef = firestoreClient.collection("users").doc(userId).collection("customers")
    const customersSnapshot = await customerRef.get()
    const customers: GoogleAdsCustomer[] = []
    customersSnapshot.forEach((customer) => {
      customers.push(<GoogleAdsCustomer>customer.data())
    })
    return customers
  }
}
