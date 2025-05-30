import {Timestamp} from "firebase-admin/firestore"
import {
  CustomerDataModel,
  UpdateUserInterface,
  UserInterface
} from "@GeneralTypes"
import {GoogleAdsCustomer, Roles, User as UserGQL} from "@GraphqlTypes"
import firestoreClient from "./firestoreClient.js"
import {UserCustomer} from "./Customer.js";
import UserDataLoaders from "./UserDataLoaders.js"

export default class User implements UserInterface {
  private _userId: string
  protected dataLoaders: UserDataLoaders
  created: Timestamp
  defaultTeam: string
  displayName: string
  email: string
  teamsMembership: Record<string, { id: string; name: string; permission: Roles }>
  refreshToken: string
  refreshTokenAddedAt: Timestamp | undefined
  customers: CustomerDataModel[]


  constructor(dataLoaders: UserDataLoaders, userId: string) {
    this._userId = userId
    this.created = Timestamp.now()
    this.defaultTeam = ""
    this.displayName = ""
    this.email = ""
    this.teamsMembership = {}
    this.refreshToken = ""
    this.refreshTokenAddedAt = Timestamp.fromDate(new Date(0))
    this.customers = []
    this.dataLoaders = dataLoaders
  }

  public get userId() {
    if (!this._userId) {
      throw new Error("Please set user id before any operation.")
    }
    return this._userId
  }

  public set userId(userId: string) {
    if (userId.length < 5) {
      throw new Error("Invalid User Id")
    }
    this._userId = userId
  }

  setAttributes(data: Partial<UserInterface>) {
    if (data.userId) {
      this.userId = data.userId
    }
    const user = {...this.toJson(), ...data}
    this.created = user.created
    this.defaultTeam = user.defaultTeam
    this.displayName = user.displayName
    this.email = user.email
    this.teamsMembership = user.teamsMembership
    this.refreshToken = user.refreshToken || ""
    this.refreshTokenAddedAt = user.refreshTokenAddedAt || Timestamp.fromDate(new Date(0))
  }

  toJson(): UserInterface {
    return {
      userId: this.userId,
      email: this.email,
      defaultTeam: this.defaultTeam,
      displayName: this.displayName,
      created: this.created,
      teamsMembership: this.teamsMembership,
      refreshToken: this.refreshToken,
      refreshTokenAddedAt: this.refreshTokenAddedAt,
    }
  }

  toGraphQLType(): UserGQL {
    return {
      userId: this.userId,
      email: this.email,
      defaultTeam: this.defaultTeam,
      displayName: this.displayName,
      created: this.created.seconds,
      teamsMembership: Object.values(this.teamsMembership)
    }
  }

  async saveUser() {
    this.dataLoaders.user.clear(this.userId)
    return firestoreClient.collection("users").doc(this.userId).set(this.toJson())
  }

  updateUser(update: UpdateUserInterface) {
    this.dataLoaders.user.clear(this.userId)
    return firestoreClient.collection("users").doc(this.userId).update(update)
  }

  async getCustomerById(id: string) {
    return await this.dataLoaders.userCustomer.load(id)
  }

  async getCustomersById(customerIds: string[]) {
    const customers = await this.dataLoaders.userCustomer.loadMany(customerIds)
    return customers.filter(customer => customer !== null) as UserCustomer[]
  }

  addTeamToUser(teamId: string, teamName: string, permission: Roles, setToDefault = false) {
    const update: Partial<UserInterface> = {
      ['teamsMembership.' + teamId]: {
        id: teamId,
        name: teamName,
      }
    }
    if (setToDefault) {
      update.defaultTeam = teamId
    }
    return firestoreClient.collection("users").doc(this.userId).update(update)
  }

  async getUser(): Promise<UserInterface> {
    const user = await this.dataLoaders.user.load(this.userId)
    if (!user) {
      throw new Error("User not found")
    }
    this.setAttributes(user)
    return this
  }

  getCustomers(): Promise<GoogleAdsCustomer[]> {
    return UserCustomer.getUserCustomers(this.userId)
  }
}

