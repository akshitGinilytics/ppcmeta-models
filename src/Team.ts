import {Timestamp} from "firebase-admin/firestore"
import {TeamCustomer, UserCustomer} from "./Customer.js"
import {UserCampaign} from "./Campaign.js"
import firestoreClient from "./firestoreClient.js"
import TeamDataLoaders from "./TeamDataLoaders.js"
import {CampaignsByCustomer, TeamDataModel, TeamMemberInterface, UserInterface, Role} from "@GeneralTypes"
import {CustomerSettings, Team as TeamGQL} from "@GraphqlTypes";
import {extractCustomerIds} from "./helper.js";
import User from "./User.js"


export default class Team implements TeamDataModel {
  private readonly _teamId
  dataLoaders: TeamDataLoaders
  created: Timestamp
  members: Record<string, TeamMemberInterface>
  name: string
  ownerId: string
  campaignsByCustomer: CampaignsByCustomer
  campaignsCount: number

  constructor(dataLoaders: TeamDataLoaders, teamId: string) {
    this._teamId = teamId
    this.created = Timestamp.now()
    this.members = {}
    this.campaignsByCustomer = {}
    this.campaignsCount = 0
    this.name = ""
    this.ownerId = ""
    this.dataLoaders = dataLoaders
  }

  public get teamId(): string {
    if (!this._teamId) {
      throw new Error("Please set team id before using Team Object.")
    }
    return this._teamId
  }

  static async createTeam(teamName: string, ownerUser: Readonly<UserInterface>, permission: Role) {
    const teamMember: TeamMemberInterface = {
      id: ownerUser.userId,
      email: ownerUser.email,
      displayName: ownerUser.displayName,
      permission: permission
    }
    const teamData: TeamDataModel = {
      name: teamName,
      ownerId: ownerUser.userId,
      created: Timestamp.now(),
      campaignsByCustomer: {},
      campaignsCount: 0,
      teamId: "",
      members: {
        [ownerUser.userId]: teamMember
      }
    }
    const result = await firestoreClient.collection("teams").add(teamData)
    await firestoreClient.collection("teams").doc(result.id).update({teamId: result.id})
    const dataLoaders = new TeamDataLoaders(result.id)
    const team = new Team(dataLoaders, result.id)
    team.setAttributes(teamData)
    dataLoaders.team.prime(result.id, team)
    return team
  }

  private async checkIfCustomersAreNotPartOfAnotherTeam(customers: UserCustomer[]) {
    const customersInTeams = await this.dataLoaders.teamCustomer.loadMany(customers.map(customer => customer.customerId))
    customersInTeams.forEach(customer => {
      if (customer instanceof TeamCustomer) {
        if (customer.teamId !== this.teamId) {
          throw Error(`Customer ${customer.name} is already part of another team`)
        }
      }
    })
  }

  public async addCustomers(customers: UserCustomer[]) {
    await this.getTeam()
    await this.checkIfCustomersAreNotPartOfAnotherTeam(customers)
    const batch = firestoreClient.batch()
    const teamCustomerIds = Object.keys(this.campaignsByCustomer)
    const customersToAddToTeam = customers.filter(customer => !teamCustomerIds.includes(customer.customerId))
    const customersToAddToTeamIds = extractCustomerIds(customersToAddToTeam)
    const customersInCustomersCollection = TeamCustomer.getCustomersByIds(customersToAddToTeamIds, this.teamId, this.dataLoaders)
    const customersInCustomersCollectionIds = extractCustomerIds(await customersInCustomersCollection)
    const customersToAddToCustomersCollection = customersToAddToTeam.filter(customer => !customersInCustomersCollectionIds.has(customer.customerId))
    customersToAddToCustomersCollection.forEach(userCustomer => {
      const customer = new TeamCustomer(this.dataLoaders, this.teamId, userCustomer.customerId)
      customer.setAttributes({...userCustomer.toJson(), teamId: this.teamId})
      const customerRef = firestoreClient.collection("customers").doc(customer.customerId)
      batch.set(customerRef, customer.toJson())  // add customer to Customers collection
    })
    const customersSettingsRef = firestoreClient.collection("teams").doc(this.teamId).collection("customersSettings")
    customersToAddToTeamIds.forEach(customerId => {
      const settingRef = customersSettingsRef.doc(customerId)
      const setting: CustomerSettings = {
        isAdded: true,
        customerId: customerId,
      }
      batch.set(settingRef, setting)  // add customer to teams > teamId > customerSettings collection
      this.campaignsByCustomer[customerId] = [] // add customer to campaignsByCustomer
    })
    batch.update(firestoreClient.collection("teams").doc(this.teamId), {campaignsByCustomer: this.campaignsByCustomer})
    this.clearCache()
    return batch.commit()
  }

  public getCustomers(): Promise<TeamCustomer[]> {
    return this.dataLoaders.getTeamCustomers()
  }

  public async getCustomersById(customerIds: string[]): Promise<(TeamCustomer)[]> {
    const customers = await this.dataLoaders.teamCustomer.loadMany(customerIds)
    return customers.filter(customer => customer instanceof TeamCustomer && customer.teamId == this.teamId) as TeamCustomer[]
  }

  public async removeCustomers(customerIds: string[]) {
    if (customerIds.length === 0) {
      return []
    }
    const batch = firestoreClient.batch()
    const customers = await this.getCustomersById(customerIds)
    console.log("customers", customers)
    customers.forEach((customer) => {
      const settingsRef = firestoreClient.collection("teams").doc(this.teamId).collection('customersSettings').doc(customer.customerId)
      batch.delete(settingsRef)
      batch.delete(firestoreClient.collection("customers").doc(customer.customerId))
      delete this.campaignsByCustomer[customer.customerId]
    })
    batch.update(firestoreClient.collection("teams").doc(this.teamId), {campaignsByCustomer: this.campaignsByCustomer})
    this.clearCache()
    return batch.commit()
  }

  public setAttributes(attributes: Partial<TeamDataModel>) {
    const team = {...this.toJson(), ...attributes}
    this.name = team.name
    this.members = team.members
    this.ownerId = team.ownerId
    this.created = team.created
    this.campaignsCount = team.campaignsCount
    this.campaignsByCustomer = team.campaignsByCustomer
  }

  public toJson(): TeamDataModel {
    return {
      teamId: this.teamId,
      name: this.name,
      ownerId: this.ownerId,
      created: this.created,
      members: this.members,
      campaignsByCustomer: this.campaignsByCustomer,
      campaignsCount: this.campaignsCount
    }
  }

  public toGraphQLType(): TeamGQL {
    return {
      teamId: this.teamId,
      name: this.name,
      ownerId: this.ownerId,
      created: this.created.seconds,
      members: Object.values(this.members)
    }
  }

  async getTeam() {
    const team = await this.dataLoaders.team.load(this.teamId)
    if (!team) {
      throw new Error("Team not found")
    }
    if (team.teamId) {
      this.setAttributes(team.toJson())
      return this
    }
    throw new Error("Team not found")
  }

  static async getTeamById(dataloader: TeamDataLoaders, teamId: string) {
    const team = new Team(dataloader, teamId)
    return await team.getTeam()
  }

  async addMember(user: User, role: Role = <Role>"viewer") {
    await user.getUser()
    const batchWrite = firestoreClient.batch()
    const teamMember: TeamMemberInterface = {
      displayName: user.displayName, id: user.userId, permission: role,
      email: user.email
    }
    const teamUpdate = {
      ["members." + user.userId]: teamMember
    }
    const teamRef = firestoreClient.collection("teams").doc(this.teamId)
    batchWrite.update(teamRef, teamUpdate)
    const userRef = firestoreClient.collection("users").doc(user.userId)
    const userUpdate = {
      teamsMembership: user.teamsMembership
    }
    userUpdate.teamsMembership[this.teamId] = {
      id: this.teamId,
      name: this.name,
      permission: role
    }
    batchWrite.update(userRef, userUpdate)
    return batchWrite.commit()
  }

  async addCampaigns(campaigns: UserCampaign[]) {
    return TeamCustomer.addCampaigns(this, campaigns)
  }

  async removeCampaigns(campaignsByCustomer: CampaignsByCustomer) {
    return TeamCustomer.removeCampaigns(this, campaignsByCustomer)
  }

  clearCache() {
    this.dataLoaders.team.clear(this.teamId)
  }

  public async renameTeam(name: string) {
    const batchWrite = firestoreClient.batch()
    await this.getTeam()
    for (const userId in this.members) {
      const userRef = firestoreClient.collection("users").doc(userId)
      batchWrite.update(userRef, {
        [`teamsMembership.${this.teamId}.name`]: name
      })
    }
    const teamRef = firestoreClient.collection("teams").doc(this.teamId)
    batchWrite.update(teamRef, {name})
    return batchWrite.commit()
  }
}

