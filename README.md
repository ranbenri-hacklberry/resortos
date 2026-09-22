# ResortOS

> **The Operating System for physical hospitality operations.**

ResortOS is not another dashboard, PMS, or collection of staff apps.

It is an operational system designed to run the physical side of a hospitality property — connecting guests, staff, rooms, equipment, IoT, robots, and business workflows into one continuously updated operational model.

The goal is simple:

**People should not have to operate ResortOS. ResortOS should operate the property through people, robots, and connected systems.**

## The idea

Most hospitality software gives people information and asks them to act.

ResortOS works the other way around.

It observes what is happening, understands what should happen, decides what needs to happen next, acts through the appropriate channel, verifies the result, and continues operating.

```
OBSERVE
   ↓
UNDERSTAND
   ↓
DECIDE
   ↓
ACT
   ↓
VERIFY
   ↓
OBSERVE
```

A housekeeper does not need to open another app just to find out what to do.

ResortOS can simply tell them through WhatsApp:

> You have 4 rooms today.  
> Start with Unit 7.  
> 2 guests.  
> Take 4 towels and 2 amenity kits.  
> Let me know when you're done.

The worker does not need to know that an operating system is behind the message.

That is intentional.

## Invisible technology

The best interface for a worker is often the interface they already use.

For one person, that may be WhatsApp.

For another, a manager dashboard.

For a robot, an API.

For a property controller, a local network.

For a guest, a door code and a message.

ResortOS sits behind all of them.

```
                    ResortOS
                        │
        ┌───────────────┼────────────────┐
        │               │                │
     People           Robots            IoT
        │               │                │
    WhatsApp        Physical work    Property state
        │               │                │
        └───────────────┼────────────────┘
                        │
                     Property
```

The technology should disappear behind the experience.

## From management software to an operating system

A traditional system might work like this:

```
System
  ↓
Shows information
  ↓
Human decides
  ↓
Human acts
  ↓
Human updates system
  ↓
System knows what happened
```

ResortOS is designed around:

```
System observes
  ↓
System understands
  ↓
System decides
  ↓
System acts
  ↓
System verifies
  ↓
System knows the current state
```

The human is involved when human judgment is actually required — not because the software needs someone to click buttons.

## The operational model

ResortOS models the property as a living operational system.

A unit is not simply a reservation. It has a physical and operational state:

```
Guest
Booking
Arrival / Departure
Payment
Access
Cleanliness
Inspection
Equipment
Maintenance
Complaints
Staff assignment
IoT state
Robot tasks
Readiness
```

For example:

```
Unit 7

Guest: arriving 15:00
Payment: complete
Cleaning: complete
Inspection: pending
Equipment: cooktop missing
Maintenance: open
Assigned: Maintenance
Verification: pending

→ NOT READY
```

A complaint is not just a message.

```
Cooktop missing
      ↓
Maintenance task
      ↓
Assignment
      ↓
Action
      ↓
Verification
      ↓
Unit READY
```

## Expected state vs. observed state

A core ResortOS concept is the distinction between:

**What should be happening**

and

**What we know is actually happening.**

For example:

```
Expected:
Unit 7 should be ready by 14:00.

Observed:
Cleaning completed.
Inspection not confirmed.
Maintenance issue still open.

Result:
Unit 7 is NOT READY.
```

"No update" is itself operational information.

If a task should have been completed by 11:30 and ResortOS has no evidence of completion, the system does not simply wait forever.

It can:

1. Contact the worker.
2. Ask for the current status.
3. Wait for a defined checkpoint.
4. Dispatch another resource if necessary.
5. Escalate to a manager only when required.

## Multimodal Verification

ResortOS does not blindly trust a single report.

A worker saying:

> "I cleaned Unit 7."

is one signal — but only one.

ResortOS can correlate multiple sources of evidence:

- Worker reports
- Door access events
- Electricity consumption
- Water usage
- IoT sensors
- Cameras / computer vision
- Robot inspection
- Timing and operational history

For example:

```
Worker:
"I cleaned Unit 7"

Observed:
Door opened for 3 minutes
No meaningful electricity usage
No water usage
No other evidence of cleaning activity

→ Anomaly detected
→ Confidence in completion: LOW
→ Verification required
```

The goal is not to distrust people.

The goal is to build a more accurate picture of physical reality by combining independent signals.

```
Human report
     +
IoT
     +
Vision
     +
Access data
     +
Time / history
     ↓
Multimodal Verification
     ↓
Operational confidence
```

ResortOS therefore does not simply store what people say happened.

It continuously evaluates what the available evidence suggests actually happened.

## Hardware Abstraction Layer

ResortOS separates operational skills from the hardware that executes them.

A ResortOS skill describes **what needs to happen**.

A Hardware Adapter describes **how a particular device makes it happen**.

```
ResortOS Core
     ↓
Skill: SET_CLIMATE
     ↓
Hardware Adapter
     ↓
Moes controller / VRF / Modbus / other hardware
```

For example:

```
Skill:
SET_CLIMATE(unit, temperature=22°C)
```

Today, the adapter may communicate with a Moes controller over the local network.

Tomorrow, the property may replace it with an industrial VRF system controlled through Modbus.

The ResortOS core logic does not change.

Only the hardware adapter changes.

```
                SET_CLIMATE
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
       Moes        VRF        Modbus
       Adapter     Adapter     Adapter
          │          │          │
          ↓          ↓          ↓
       Device      HVAC       Controller
```

**The property should not have to redesign its operational logic every time its hardware changes.**

## Local-first architecture

Each property can run its own local ResortOS Edge.

```
Staff / Desk / Robot / IoT
            │
            ↓
      Property Edge
     Mac Mini / Studio
            │
     Local operational
        state & APIs
            │
            ↕
       Async sync
            │
            ↓
           Cloud
```

The property should continue operating even if the Internet is temporarily unavailable.

The Cloud provides:

- encrypted backup
- replication
- multi-property management
- analytics
- remote access
- global configuration
- updates
- disaster recovery
- cross-property intelligence

The Edge provides:

- operational database
- local APIs
- staff sessions
- property state
- IoT control
- robot control
- local automation
- local AI/vision workloads

**Cloud-connected, not Cloud-dependent.**

## Humans are resources, not software users

ResortOS does not assume that every employee wants another application.

Most workers already have a communication channel they understand.

That channel can become the interface.

The system can:

- assign work
- send instructions
- ask questions
- follow up
- detect delays
- escalate exceptions
- verify completion
- coordinate multiple workers

The employee does not need to understand the system's internal architecture.

They just need to receive the right instruction at the right time.

## Robots as the physical layer

Robots extend ResortOS into the physical world.

A robot can become:

- a delivery agent
- a transport system
- an inspection system
- a mobile sensor
- a remotely operated worker
- eventually, an autonomous physical operator

The architecture is intentionally separated:

```
ResortOS Skill
      ↓
Hardware Adapter
      ↓
Robot
```

A skill such as:

```
DELIVER_ITEM
INSPECT_ROOM
OPEN_DOOR
SET_CLIMATE
COLLECT_CASH
```

should not belong to one specific robot.

The skill belongs to ResortOS.

The hardware adapter translates that skill to whatever physical platform is available.

## Verification loop

ResortOS does not stop at sending an instruction.

It verifies outcomes.

```
Assign
  ↓
Act
  ↓
Observe
  ↓
Verify
  ↓
Update state
```

Verification can come from:

- worker confirmation
- IoT
- cameras
- computer vision
- sensors
- robot inspection
- time-based operational evidence
- manager confirmation

This creates a system that can increasingly manage operations without requiring constant human supervision.

## The long-term vision

The goal is not to build more screens.

It is to remove operational work from the human manager.

A manager should not have to spend the day asking:

> Who is cleaning Unit 7?

> Is Unit 12 ready?

> Why hasn't maintenance arrived?

> Did someone bring the towels?

> What happened with the late check-in?

ResortOS should already know.

And when it does not know, it should find out.

When it cannot solve something, it should escalate it.

The manager should see the exceptions — not operate every routine action.

## What ResortOS is

**ResortOS is an operating system for physical hospitality businesses.**

It connects:

```
Guests
  ↕
ResortOS
  ↕
Property
  ↕
Rooms / Units
  ↕
Staff
  ↕
IoT
  ↕
Robots
  ↕
Business systems
```

The objective is not to make hospitality workers better at using software.

The objective is to make the property capable of operating itself.

## Current capabilities

ResortOS currently includes:

- Property and unit management
- Booking and occupancy management
- Operational state management
- Housekeeping workflows
- Maintenance workflows
- Staff management
- Guest portal
- Payments
- WhatsApp-based communication
- SOP management
- Local Edge operational APIs
- Role and unit-level authorization
- Local operational event streaming
- Property-level operational state
- Cloud-connected architecture
- Robot and IoT integration architecture

The system is actively evolving toward autonomous operational management.

## Philosophy

> **Don't give the operator another system to operate.**
>
> **Remove the operations they shouldn't have to operate.**

## Status

ResortOS is an actively developed system being tested against real hospitality operations.

The architecture is being developed from real-world operational requirements rather than from software abstractions alone.

## Development

```bash
git clone https://github.com/ranbenri-hacklberry/resortos.git
cd resortos
npm install
npm run dev
```

Local development runs the ResortOS application on port 3001.

## License

All rights reserved © ResortOS 2026.
