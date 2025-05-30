import firestoreClient from "./firestoreClient.js";
import {TeamCustomer} from "./Customer.js";
import {CampaignDataModel} from "@GeneralTypes";
import {TeamCampaign} from "./Campaign.js";
import {DocumentData} from "firebase-admin/firestore";
import Team from "./Team.js";
import DataLoader from "dataloader";
import {CampaignSettings, CustomerSettings} from "@GraphqlTypes";
import {mapper} from "./helper.js";

export default class TeamDataLoaders {
  private teamId: string
  public addedCustomersIds: string[] = []
  public addedCampaignsIds: string[] = []
  public customersCampaigns: Record<string, TeamCampaign[]> = {}
  team: DataLoader<string, Team | null>
  teamCampaign: DataLoader<string, TeamCampaign | null>
  teamCustomer: DataLoader<string, TeamCustomer | null>
  teamCampaignSettings: DataLoader<string, CampaignSettings | null>
  teamCustomerSettings: DataLoader<string, CustomerSettings | null>

  constructor(teamId: string) {
    this.teamId = teamId
    this.team = new DataLoader(this.batchTeam.bind(this))
    this.teamCampaign = new DataLoader(this.batchTeamCampaigns.bind(this))
    this.teamCustomer = new DataLoader(this.batchTeamCustomers.bind(this))
    this.teamCustomerSettings = new DataLoader(this.batchTeamCustomerSettings.bind(this))
    this.teamCampaignSettings = new DataLoader(this.batchTeamCampaignSettings.bind(this))
  }

  setTeamId(teamId: string) {
    this.teamId = teamId
  }

  async batchTeam(teamIds: Readonly<string[]>) {
    console.info("batchTeam", teamIds)
    const teamRefs = teamIds.map(id => firestoreClient.collection("teams").doc(id))
    console.log("teamRefs", teamRefs.map(ref => ref.path))
    const teamsSnapshot = await firestoreClient.getAll(...teamRefs)
    const teams = <(DocumentData | null)[]>mapper(teamsSnapshot, teamIds)
    return teams.map((teamData) => {
      if (!teamData) {
        return null
      }
      const team = new Team(this, teamData.teamId)
      team.setAttributes(teamData)
      return team
    })
  }

  private async batchTeamCampaigns(campaignIds: Readonly<string[]>) {
    console.info("batchTeamCampaigns", campaignIds)
    const campaignRefs = campaignIds.map(id => firestoreClient.collection("campaigns").doc(id))
    const campaignsSnapshot = await firestoreClient.getAll(...campaignRefs)
    const campaigns = <(CampaignDataModel | null)[]>mapper(campaignsSnapshot, campaignIds)
    return campaigns.map((campaignData) => {
      if (!campaignData) {
        return null
      }
      const campaign = new TeamCampaign(this, campaignData.campaignId)
      campaign.setAttributes(campaignData)
      return campaign
    })

  }

  private async batchTeamCustomers(customerIds: Readonly<string[]>) {
    console.info("batchTeamCustomers", customerIds)
    const customerRefs = customerIds.map(id => firestoreClient.collection("customers").doc(id))
    const customersSnapshot = await firestoreClient.getAll(...customerRefs)
    const customers = <(DocumentData | null)[]>mapper(customersSnapshot, customerIds)
    return customers.map((customerData) => {
      if (!customerData) {
        return null
      }
      const customer = new TeamCustomer(this, customerData.teamId, customerData.customerId)
      customer.setAttributes(customerData)
      return customer
    })
  }

  private async batchTeamCustomerSettings(customerIds: Readonly<string[]>) {
    console.info("batchTeamCustomerSettings", customerIds)
    const customerSettingsRefs = customerIds.map(customerId => firestoreClient.collection("teams").doc(this.teamId).collection("customersSettings").doc(customerId))
    const customerSettingsSnapshot = await firestoreClient.getAll(...customerSettingsRefs)
    return <(CustomerSettings | null)[]>mapper(customerSettingsSnapshot, customerIds)
  }

  private async batchTeamCampaignSettings(campaignIds: Readonly<string[]>) {
    console.info("batchTeamCampaignSettings", campaignIds)
    const campaignSettingsRefs = campaignIds.map(campaignId => firestoreClient.collection("teams").doc(this.teamId).collection("campaignsSettings").doc(campaignId))
    const campaignSettingsSnapshot = await firestoreClient.getAll(...campaignSettingsRefs)
    return <(CampaignSettings | null)[]>mapper(campaignSettingsSnapshot, campaignIds)
  }

  async getTeamCustomers(): Promise<TeamCustomer[]> {
    if (this.addedCustomersIds.length) {
      return (await this.teamCustomer.loadMany(this.addedCustomersIds)).filter((customer) => !(customer instanceof Error || customer !== null)) as TeamCustomer[]
    }
    const query = firestoreClient.collection("customers").where("teamId", "==", this.teamId)
    const snapshot = await query.get()
    return snapshot.docs.map(doc => {
      const customer = new TeamCustomer(this, this.teamId, doc.id)
      customer.setAttributes(doc.data())
      this.teamCustomer.prime(doc.id, customer)
      this.addedCustomersIds.push(doc.id)
      return customer
    })
  }

  async getTeamCampaigns(): Promise<TeamCampaign[]> {
    if (this.addedCampaignsIds.length) {
      return (await this.teamCampaign.loadMany(this.addedCampaignsIds)).filter((campaign) => !(campaign instanceof Error || campaign !== null)) as TeamCampaign[]
    }
    const query = firestoreClient.collection("campaigns").where("teamId", "==", this.teamId)
    const snapshot = await query.get()
    return snapshot.docs.map(doc => {
      const campaign = new TeamCampaign(this, doc.id)
      campaign.setAttributes(doc.data())
      this.teamCampaign.prime(doc.id, campaign)
      return campaign
    })
  }

  async getCustomersCampaigns(customerId: string): Promise<TeamCampaign[]> {
    if (this.customersCampaigns[customerId]) {
      return this.customersCampaigns[customerId]
    }
    const query = firestoreClient.collection("campaigns")
      .where("customerId", "==", customerId)
      .where("teamId", "==", this.teamId)

    console.log("customerId", customerId)
    console.log("this.teamId", this.teamId)

    const snapshot = await query.get()
    this.customersCampaigns[customerId] = snapshot.docs.map(doc => {
      const campaign = new TeamCampaign(this, doc.id)
      campaign.setAttributes(doc.data())
      this.teamCampaign.prime(doc.id, campaign)
      return campaign
    })
    return this.customersCampaigns[customerId]
  }

}
