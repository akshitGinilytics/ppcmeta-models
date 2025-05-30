import {InviteDataModel, Role} from "@GeneralTypes"
import {Timestamp} from "firebase-admin/firestore"
import firestoreClient from "./firestoreClient.js"
import {Teammate} from "@GraphqlTypes"

export default class TeamInvite implements InviteDataModel {
  readonly inviteId: string
  invitedBy = {
    userId: "",
    displayName: "",
    email: ""
  }
  email = ""
  role = <Role>"manager"
  status = "pending"
  teamId = ""
  teamName = ""
  updated: Timestamp
  created: Timestamp

  constructor(InviteId: string) {
    this.inviteId = InviteId
    this.updated = Timestamp.now()
    this.created = Timestamp.now()
  }


  static async createInvite(email: string, role: Role, teamId: string, teamName: string, sender:Teammate) {
    const attributes: InviteDataModel = {
      inviteId: "",
      email,
      role,
      status: "pending",
      teamId,
      teamName,
      invitedBy: {
        email: sender.email,
        userId: sender.userId,
        displayName: sender.displayName
      },
      updated: Timestamp.now(),
      created: Timestamp.now()
    }
    const result = await firestoreClient.collection("teamInvites").add(attributes)
    await firestoreClient.collection("teamInvites").doc(result.id).update({inviteId: result.id})
    const newInvite = new TeamInvite(result.id)
    newInvite.setAttributes(attributes)
    return newInvite
  }

  setInviteStatus(status: string) {
    this.status = status
    this.updated = Timestamp.now()
  }

  public async getInvite(){
    const result = await firestoreClient.collection("teamInvites").doc(this.inviteId).get()
    if (!result.exists) {
      throw new Error("Invite not found")
    }
    this.setAttributes(<InviteDataModel>result.data())
  }

  public async acceptInvite() {
    this.setInviteStatus("accepted")
    await this.saveInvite()
  }

  public async saveInvite() {
    await firestoreClient.collection("teamInvites").doc(this.inviteId).set(this.toJson())
  }

  public async declineInvite() {
    this.setInviteStatus("declined")
    await firestoreClient.collection("teamInvites").doc(this.inviteId).delete()
  }

  toJson() {
    return {
      inviteId: this.inviteId,
      invitedBy: this.invitedBy,
      email: this.email,
      role: this.role,
      status: this.status,
      teamId: this.teamId,
      teamName: this.teamName,
      updated: this.updated,
      created: this.created,
    }
  }

  setAttributes(attributes: Partial<InviteDataModel>) {
    const invite = {...this.toJson(), ...attributes}
    this.invitedBy = invite.invitedBy
    this.email = invite.email
    this.role = invite.role
    this.status = invite.status
    this.teamId = invite.teamId
    this.teamName = invite.teamName
    this.updated = Timestamp.now()
    this.created = attributes.created?.seconds? attributes.created : this.created
  }
}