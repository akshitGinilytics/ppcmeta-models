import {Timestamp} from "firebase-admin/firestore";
import {BigBatch} from "@qualdesk/firestore-big-batch";
import firestoreClient from "./firestoreClient.js";
import Team from "./Team.js";
import TeamDataLoaders from "./TeamDataLoaders.js";
import UserDataLoaders from "./UserDataLoaders.js";
import {CampaignDataModel} from "@GeneralTypes"
import {CampaignBudget, Metrics} from "@GraphqlTypes"


class Campaign implements CampaignDataModel {
  private readonly _campaignId: string
  campaignBudget: CampaignBudget = {amount_micros: 0, budgetId: "", resourceName: ""}
  firstImportedAt: Timestamp
  customerId: string;
  lastUpdated: Timestamp
  metrics: Metrics = {allConversions: 0, averageCPC: 0, clicks: 0, costMicros: 0, impressions: 0, xDaysAverageCost: 0}
  name: string;
  ownerId: string
  resourceName: string
  status: "ENABLED" | "PAUSED" | "REMOVED" | "UNKNOWN" | "UNSPECIFIED";
  teamId: string
  dataLoader: TeamDataLoaders | UserDataLoaders

  constructor(dataLoaders: TeamDataLoaders | UserDataLoaders, campaignId: string) {
    this._campaignId = campaignId
    this.firstImportedAt = Timestamp.now()
    this.lastUpdated = Timestamp.now()
    this.customerId = ""
    this.name = ""
    this.ownerId = ""
    this.resourceName = ""
    this.status = "UNKNOWN"
    this.teamId = ""
    this.dataLoader = dataLoaders
  }

  get campaignId() {
    return this._campaignId
  }

  static async getCampaign(dataLoader: TeamDataLoaders | UserDataLoaders, campaignId: string): Promise<Campaign> {
    const campaign = new Campaign(dataLoader, campaignId)
    await campaign.getCampaign()
    return campaign
  }

  async getCampaign(): Promise<Campaign | TeamCampaign> {
    throw new Error("Not implemented")
  }

  protected _setAttributes(campaignData: CampaignDataModel) {
    this.campaignBudget = campaignData.campaignBudget
    this.firstImportedAt = campaignData.firstImportedAt
    this.customerId = campaignData.customerId
    this.lastUpdated = campaignData.lastUpdated
    this.metrics = campaignData.metrics
    this.name = campaignData.name
    this.ownerId = campaignData.ownerId
    this.resourceName = campaignData.resourceName
    this.status = campaignData.status
    this.teamId = campaignData.teamId
  }

  setAttributes(campaignData: Partial<CampaignDataModel>) {
    const data: CampaignDataModel = {...this.toJson(), ...campaignData}
    this._setAttributes(data)
  }

  toJson(): CampaignDataModel {
    return {
      campaignBudget: this.campaignBudget,
      campaignId: this.campaignId,
      firstImportedAt: this.firstImportedAt,
      customerId: this.customerId,
      lastUpdated: this.lastUpdated,
      metrics: this.metrics,
      name: this.name,
      ownerId: this.ownerId,
      resourceName: this.resourceName,
      status: this.status,
      teamId: this.teamId,
    }
  }
}

export class TeamCampaign extends Campaign {
  dataLoader: TeamDataLoaders

  constructor(dataLoader: TeamDataLoaders, campaignId: string) {
    super(dataLoader, campaignId)
    this.dataLoader = dataLoader
  }

  async getCampaign(): Promise<TeamCampaign> {
    const campaign = await this.dataLoader.teamCampaign.load(this.campaignId)
    if (campaign === null) {
      throw new Error(`Campaign ${this.campaignId} not found`)
    }
    this._setAttributes(campaign)
    return this
  }

  static async batchRemoveCampaigns(campaigns: TeamCampaign[], team: Team): Promise<void> {
    const batch = new BigBatch({firestore: firestoreClient})
    await Promise.all([...campaigns.map(async campaign => campaign.getCampaign()), team.getTeam()])
    campaigns.forEach(campaign => {
      batch.delete(firestoreClient.doc(`campaigns/${campaign.campaignId}`))
      batch.update(firestoreClient.doc(`teams/${team.teamId}/campaignsSettings/${campaign.campaignId}`), {
        isAdded: false
      })
    })
    await batch.commit()
  }
}

export class UserCampaign extends Campaign {
  dataLoader: UserDataLoaders
  ownerId: string

  constructor(dataloader: UserDataLoaders, ownerId: string, customerId: string, campaignId: string) {
    super(dataloader, campaignId)
    this.ownerId = ownerId
    this.customerId = customerId
    this.dataLoader = dataloader
  }

  async getCampaign(): Promise<Campaign> {
    const key = `${this.customerId}/${this.campaignId}`
    const campaign = await this.dataLoader.userCampaign.load(key)
    if (campaign === null) {
      throw new Error(`Campaign ${this.campaignId} not found`)
    }
    super._setAttributes(campaign.toJson())
    return this
  }
}
