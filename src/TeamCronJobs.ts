import firestoreClient from "./firestoreClient.js";
import {TeamDataModel} from "@GeneralTypes";
import {Timestamp} from "firebase-admin/firestore";
import {firestore} from "firebase-admin";
import DocumentReference = firestore.DocumentReference;


interface TeamCronJobsInterface {
  teamId: string
  ownerId: string
  ownerRefreshToken: string
  campaignsByCustomer: Record<string, string[]>
  campaignsCount: number
  lastCronJob: Timestamp
  lastFailedCronJob: Timestamp
  isCronFailing: boolean
}

export default class TeamCronJobs implements TeamCronJobsInterface {
  private teamData: TeamDataModel
  readonly teamId: string
  ownerId: string
  ownerRefreshToken: string
  campaignsByCustomer: Record<string, string[]>
  campaignsCount: number
  lastCronJob: Timestamp
  isCronFailing: boolean = false
  lastFailedCronJob: Timestamp
  reference: DocumentReference

  constructor(team: TeamDataModel, ownerRefreshToken: string|undefined=undefined) {
    this.teamData = team
    this.teamId = team.teamId
    this.ownerId = team.ownerId
    this.ownerRefreshToken = ownerRefreshToken || ""
    this.campaignsByCustomer = team.campaignsByCustomer
    this.campaignsCount = team.campaignsCount
    this.lastCronJob = Timestamp.now()
    this.lastFailedCronJob = Timestamp.fromDate(new Date(0))
    this.isCronFailing = false
    this.reference = firestoreClient.collection("__cronCampaignsUpdate").doc(this.teamData.teamId)
  }

  setAttributes(cronJobData: Partial<TeamCronJobsInterface>) {
    const data = {...this.toJson(), ...cronJobData}
    this.ownerId = data.ownerId
    this.ownerRefreshToken = data.ownerRefreshToken
    this.campaignsByCustomer = data.campaignsByCustomer
  }


  toJson(): TeamCronJobsInterface {
    return {
      teamId: this.teamId,
      ownerId: this.ownerId,
      ownerRefreshToken: this.ownerRefreshToken,
      campaignsByCustomer: this.campaignsByCustomer,
      campaignsCount: this.campaignsCount,
      lastCronJob: this.lastCronJob,
      lastFailedCronJob: this.lastFailedCronJob,
      isCronFailing: this.isCronFailing
    }
  }

  async getCronJob() {
    const reference = firestoreClient.collection("cronJobs").doc("campaignsUpdate").collection("teams").doc(this.teamData.teamId)
    const doc = await reference.get()
    if (doc.exists) {
      this.setAttributes(doc.data() as TeamCronJobsInterface)
      return <TeamCronJobsInterface>doc.data()
    }
    return null
  }

  async createCronJob(ownerRefreshToken:string|undefined=undefined) {
    if(!this.ownerRefreshToken && !ownerRefreshToken) {
      throw new Error("Please set owner refresh token before creating cron job.")
    }
    const refreshToken = ownerRefreshToken || this.ownerRefreshToken
    const data:TeamCronJobsInterface = {...this.toJson(), ownerRefreshToken: refreshToken}
    return await this.reference.set(data, {merge: true})
  }

  async updateCronJob(data: Partial<TeamCronJobsInterface>) {
    this.setAttributes(data)
    return await this.reference.update(data)
  }

  async removeCronJob() {
    return await this.reference.delete()
  }
}
