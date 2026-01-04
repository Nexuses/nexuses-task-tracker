import clientPromise from '../mongodb'
import { ObjectId } from 'mongodb'

export interface WorkActivity {
  _id?: string
  employeeName: string
  employeeId?: string
  date: string
  tasks: Task[]
  createdAt?: Date
  updatedAt?: Date
}

export interface Task {
  id: string
  projectName: string
  taskName: string
  outcomeLink: string
  notes: string
  oldTaskName?: string // For tracking updates
  isUpdated?: boolean // Flag to show if task was updated
  firstWorkedOnDate?: string // Date when this task was first worked on
  createdAt?: Date
  updatedAt?: Date
}

export async function createWorkActivity(
  employeeName: string,
  employeeId: string | null,
  date: string,
  tasks: Task[]
): Promise<WorkActivity> {
  const client = await clientPromise
  const db = client.db('workform')
  const activities = db.collection<WorkActivity>('workActivities')

  // Check if activity exists for this employee and date
  const existingActivity = await activities.findOne({
    employeeName,
    date,
  })

  if (existingActivity) {
    // Update existing activity - merge tasks and mark updates
    const updatedTasks = tasks.map((newTask) => {
      // Check if this task already exists (by task name - same task name means update)
      const existingTask = existingActivity.tasks.find(
        (t) => t.taskName === newTask.taskName
      )

      if (existingTask) {
        // Same task name exists - this is an update
        // Check if link or notes changed
        const linkChanged = existingTask.outcomeLink !== newTask.outcomeLink
        const notesChanged = existingTask.notes !== newTask.notes
        
        if (linkChanged || notesChanged) {
          // Task was updated - mark as updated
          return {
            ...newTask,
            oldTaskName: existingTask.oldTaskName || existingTask.taskName, // Preserve old task name chain
            isUpdated: true,
            createdAt: existingTask.createdAt || new Date(),
            updatedAt: new Date(),
          }
        } else {
          // Same task, no changes
          return {
            ...newTask,
            oldTaskName: existingTask.oldTaskName,
            isUpdated: existingTask.isUpdated || false,
            createdAt: existingTask.createdAt || new Date(),
            updatedAt: existingTask.updatedAt || new Date(),
          }
        }
      } else {
        // New task name - check if it's a renamed task (same project)
        const projectTask = existingActivity.tasks.find(
          (t) => t.projectName === newTask.projectName
        )
        
        if (projectTask && projectTask.taskName !== newTask.taskName) {
          // Task name changed for same project - mark as updated
          return {
            ...newTask,
            oldTaskName: projectTask.taskName,
            isUpdated: true,
            createdAt: projectTask.createdAt || new Date(),
            updatedAt: new Date(),
          }
        } else {
          // Completely new task
          return {
            ...newTask,
            createdAt: new Date(),
          }
        }
      }
    })

    const result = await activities.updateOne(
      { _id: existingActivity._id },
      {
        $set: {
          tasks: updatedTasks,
          updatedAt: new Date(),
        },
      }
    )

    return { ...existingActivity, tasks: updatedTasks }
  } else {
    // Create new activity - check if task names were used on previous dates
    // Get all previous activities for this employee
    const previousActivities = await activities
      .find({
        $or: [
          { employeeName },
          ...(employeeId ? [{ employeeId }] : [])
        ],
        date: { $lt: date } // Only check previous dates
      })
      .sort({ date: -1 })
      .toArray()

    // Map to check if task names were used before
    const previousTaskNames = new Set<string>()
    previousActivities.forEach((prevActivity: any) => {
      prevActivity.tasks?.forEach((task: any) => {
        if (task.taskName) {
          previousTaskNames.add(task.taskName.toLowerCase())
        }
      })
    })

    // Mark tasks as "Re-updated" if they were worked on before
    const tasksWithHistory = tasks.map((task) => {
      const wasWorkedOnBefore = previousTaskNames.has(task.taskName.toLowerCase())
      
      if (wasWorkedOnBefore) {
        // Find the first date this task was worked on (oldest date first)
        let firstWorkedOnDate: string | null = null
        // Sort by date ascending to find the earliest
        const sortedActivities = [...previousActivities].sort((a: any, b: any) => 
          a.date.localeCompare(b.date)
        )
        for (const prevActivity of sortedActivities) {
          const foundTask = prevActivity.tasks?.find(
            (t: any) => t.taskName.toLowerCase() === task.taskName.toLowerCase()
          )
          if (foundTask) {
            firstWorkedOnDate = prevActivity.date
            break
          }
        }

        return {
          ...task,
          isUpdated: true,
          firstWorkedOnDate: firstWorkedOnDate || undefined,
          createdAt: new Date(),
        }
      } else {
        return {
          ...task,
          createdAt: new Date(),
        }
      }
    })

    const activity: WorkActivity = {
      employeeName,
      employeeId: employeeId || undefined,
      date,
      tasks: tasksWithHistory,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await activities.insertOne(activity)
    return { ...activity, _id: result.insertedId.toString() }
  }
}

export async function getWorkActivitiesByEmployee(employeeName: string): Promise<WorkActivity[]> {
  const client = await clientPromise
  const db = client.db('workform')
  const activities = db.collection('workActivities')

  const results = await activities
    .find({ employeeName })
    .sort({ date: -1 }) // Most recent first
    .toArray()

  return results.map((act: any) => ({
    ...act,
    _id: act._id.toString(),
  }))
}

export async function getWorkActivitiesByEmployeeId(employeeId: string): Promise<WorkActivity[]> {
  const client = await clientPromise
  const db = client.db('workform')
  const activities = db.collection('workActivities')

  const results = await activities
    .find({ employeeId })
    .sort({ date: -1 }) // Most recent first
    .toArray()

  return results.map((act: any) => ({
    ...act,
    _id: act._id.toString(),
  }))
}

export async function getAllWorkActivities(): Promise<WorkActivity[]> {
  const client = await clientPromise
  const db = client.db('workform')
  const activities = db.collection('workActivities')

  const results = await activities
    .find({})
    .sort({ date: -1, employeeName: 1 })
    .toArray()

  return results.map((act: any) => ({
    ...act,
    _id: act._id.toString(),
  }))
}

export async function deleteWorkActivity(activityId: string): Promise<boolean> {
  const client = await clientPromise
  const db = client.db('workform')
  const activities = db.collection('workActivities')

  const result = await activities.deleteOne({ _id: new ObjectId(activityId) })
  return result.deletedCount > 0
}

