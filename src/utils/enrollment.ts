import { Types } from "mongoose";
import {
  IWebinar,
  IWebinarEnrolledUser,
  IWebinarEnrolledUserCert,
} from "../models/Webinar.model";
import { IUser } from "../models/User.model";

function toStringId(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Types.ObjectId) {
    return value.toString();
  }

  if (typeof (value as any).toString === "function") {
    return (value as any).toString();
  }

  return null;
}

export function isUserEnrolled(webinar: Pick<IWebinar, "enrolledUsers">, userId: string): boolean {
  if (!webinar.enrolledUsers) {
    return false;
  }

  return webinar.enrolledUsers.some((entry: IWebinarEnrolledUser | any) => {
    if (!entry) {
      return false;
    }

    if ((entry as IWebinarEnrolledUser).userId) {
      return toStringId((entry as IWebinarEnrolledUser).userId) === userId;
    }

    return toStringId(entry) === userId;
  });
}

export function createEnrollmentRecord(user: Pick<IUser, "_id" | "firstName" | "lastName" | "email">, cert?: Partial<IWebinarEnrolledUserCert>): IWebinarEnrolledUser {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();

  return {
    userId: user._id,
    name,
    email: user.email,
    cert: {
      status: "pending",
      attempts: 0,
      ...cert,
    },
  };
}

export function updateCertState(
  enrollment: IWebinarEnrolledUser,
  patch: Partial<IWebinarEnrolledUserCert>
): IWebinarEnrolledUser {
  return {
    ...enrollment,
    cert: {
      ...enrollment.cert,
      ...patch,
    },
  };
}
