#  IMT Account Manager Updated

export default function RoyEnoCRM() { const pipeline = [ { title: 'New Lead', color: 'border-blue-500', leads: [ { name: 'Tapiwa Moyo', type: 'Residential System', amount: '$4,500' }, { name: 'Prosper Ndlovu', type: 'Solar Pump System', amount: '$3,200' }, ], }, { title: 'Qualified', color: 'border-orange-500', leads: [ { name: 'Alpha Engineering', type: '30kW Commercial', amount: '$32,000' }, { name: 'Greenview Cottage', type: '8kW Hybrid System', amount: '$6,600' }, ], }, { title: 'Proposal Sent', color: 'border-purple-500', leads: [ { name: 'ZimBrewery Ltd', type: '50kW System', amount: '$45,000' }, { name: 'Sunridge Park', type: '8kW System', amount: '$4,900' }, ], }, { title: 'Won', color: 'border-green-500', leads: [ { name: 'Mega Store Harare', type: '40kW System', amount: '$36,000' }, { name: 'Mountain View Lodge', type: '15kW System', amount: '$18,600' }, ], }, ];



return ( <div className="min-h-screen bg-[#f5f7fb] flex font-sans text-slate-800"> <aside className="w-72 bg-[#041B46] text-white flex flex-col p-5 shadow-2xl"> <div className="flex items-center gap-3 mb-10"> <div className="h-14 w-14 rounded-2xl bg-orange-500 flex items-center justify-center text-2xl font-bold shadow-lg"> ☀ </div> <div> <h1 className="text-3xl font-bold leading-none text-orange-400">RoyEno</h1> <p className="tracking-[4px] text-sm text-slate-300 mt-1">SOLARTECH CRM</p> </div> </div>



<nav className="space-y-2 text-[15px]">

      {[

        'Dashboard',

        'Leads',

        'Clients',

        'Contacts',

        'Sales Pipeline',

        'Quotes',

        'Proposals',

        'Installations',

        'Products & Systems',

        'Tasks & Activities',

        'Calendar',

        'Documents',

        'Invoices',

        'Payments',

        'Reports & Analytics',

        'Marketing',

        'Settings',

      ].map((item, idx) => (

        <div

          key={item}

          className={`px-4 py-3 rounded-2xl cursor-pointer transition-all duration-200 ${

            idx === 0

              ? 'bg-orange-500 text-white shadow-lg'

              : 'hover:bg-white/10 text-slate-200'

          }`}

        >

          {item}

        </div>

      ))}

    </nav>



    <div className="mt-auto bg-white/10 rounded-2xl p-4 backdrop-blur-md">

      <p className="text-orange-400 font-semibold">RoyEno Solartech CRM</p>

      <p className="text-sm text-slate-300 mt-1">Powering a Brighter Future ☀</p>

    </div>

  </aside>



  <main className="flex-1 overflow-auto">

    <header className="bg-[#041B46] px-8 py-5 flex items-center justify-between shadow-lg">

      <div className="flex items-center gap-4 w-full max-w-3xl">

        <div className="text-white text-3xl">☰</div>

        <input

          className="w-full bg-[#0B2B66] border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-orange-500"

          placeholder="Search leads, clients, systems, invoices..."

        />

      </div>



      <div className="flex items-center gap-5 ml-8">

        <button className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-2xl font-semibold shadow-lg transition-all">

          + New

        </button>



        <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-2 shadow-md">

          <div className="h-12 w-12 rounded-full bg-slate-300"></div>

          <div>

            <p className="font-bold text-[#041B46]">Tawanda Chikosi</p>

            <p className="text-sm text-slate-500">Sales Manager</p>

          </div>

        </div>

      </div>

    </header>



    <div className="p-8 space-y-8">

      <div>

        <h2 className="text-4xl font-bold text-[#041B46]">Welcome back, Tawanda 👋</h2>

        <p className="text-slate-500 mt-2">Here’s what’s happening with your solar business today.</p>

      </div>



      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">

        {[

          ['New Leads', '48', '+18% vs yesterday'],

          ['Total Clients', '326', '+14% this month'],

          ['Open Deals', '$258,700', '+22% growth'],

          ['Installations', '34', '13 this week'],

          ['Revenue', '$186,450', '+28% this month'],

        ].map((card) => (

          <div key={card[0]} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-xl transition-all">

            <p className="text-slate-500 font-medium">{card[0]}</p>

            <h3 className="text-4xl font-bold mt-3 text-[#041B46]">{card[1]}</h3>

            <p className="text-green-600 mt-2 text-sm font-semibold">{card[2]}</p>

          </div>

        ))}

      </section>



      <section className="grid grid-cols-1 xl:grid-cols-4 gap-5">

        {pipeline.map((stage) => (

          <div key={stage.title} className={`bg-white rounded-3xl shadow-sm border-t-4 ${stage.color} p-5`}>

            <div className="flex items-center justify-between mb-5">

              <h3 className="text-xl font-bold text-[#041B46]">{stage.title}</h3>

              <span className="bg-slate-100 text-slate-500 text-sm px-3 py-1 rounded-full">

                {stage.leads.length} Leads

              </span>

            </div>



            <div className="space-y-4">

              {stage.leads.map((lead) => (

                <div key={lead.name} className="bg-slate-50 rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer border border-slate-100">

                  <div className="flex items-start justify-between">

                    <div>

                      <h4 className="font-bold text-[#041B46]">{lead.name}</h4>

                      <p className="text-sm text-slate-500 mt-1">{lead.type}</p>

                    </div>

                    <span className="text-orange-500 font-bold">{lead.amount}</span>

                  </div>

                </div>

              ))}

            </div>



            <button className="w-full mt-5 border-2 border-dashed border-slate-200 rounded-2xl py-3 text-slate-500 hover:border-orange-500 hover:text-orange-500 transition-all">

              + Add Lead

            </button>

          </div>

        ))}

      </section>



      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        <div className="xl:col-span-2 bg-white rounded-3xl shadow-sm p-6 border border-slate-100">

          <div className="flex items-center justify-between mb-6">

            <h3 className="text-2xl font-bold text-[#041B46]">Client Database</h3>

            <button className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-2xl font-semibold">

              + Add Client

            </button>

          </div>



          <div className="overflow-hidden rounded-2xl border border-slate-100">

            <table className="w-full">

              <thead className="bg-slate-50 text-left">

                <tr>

                  {['Client', 'Location', 'System Type', 'Size', 'Status', 'Next Action'].map((head) => (

                    <th key={head} className="p-4 text-sm text-slate-500 font-semibold">

                      {head}

                    </th>

                  ))}

                </tr>

              </thead>



              <tbody>

                {[

                  ['Mega Store Harare', 'Harare', 'Hybrid System', '40kW', 'Installation', 'Commissioning - 22 May'],

                  ['Mountain View Lodge', 'Mutare', 'Hybrid System', '15kW', 'Active', 'Maintenance - 18 Jun'],

                  ['Alpha Engineering', 'Harare', 'Commercial System', '30kW', 'Proposal', 'Follow Up - 23 May'],

                  ['Greenview Cottage', 'Nyanga', 'Hybrid System', '8kW', 'Proposal', 'Follow Up - 21 May'],

                ].map((row) => (

                  <tr key={row[0]} className="border-t border-slate-100 hover:bg-slate-50 transition-all">

                    {row.map((col, idx) => (

                      <td key={idx} className="p-4">

                        <span

                          className={`$ {

                            idx === 4

                              ? col === 'Active'

                                ? 'text-green-600 font-semibold'

                                : col === 'Proposal'

                                ? 'text-orange-500 font-semibold'

                                : 'text-blue-600 font-semibold'

                              : ''

                          }`}

                        >

                          {col}

                        </span>

                      </td>

                    ))}

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </div>



        <div className="space-y-5">

          <div className="bg-white rounded-3xl shadow-sm p-6 border border-slate-100">

            <h3 className="text-2xl font-bold text-[#041B46] mb-5">Quick Actions</h3>



            <div className="grid grid-cols-2 gap-4">

              {[

                'Add New Lead',

                'Add Client',

                'Create Quote',

                'New Proposal',

                'Schedule Visit',

                'Add Installation',

                'Record Payment',

                'Create Invoice',

              ].map((action) => (

                <button

                  key={action}

                  className="bg-slate-50 hover:bg-orange-500 hover:text-white transition-all rounded-2xl p-4 text-sm font-semibold border border-slate-100"

                >

                  {action}

                </button>

              ))}

            </div>

          </div>



          <div className="bg-white rounded-3xl shadow-sm p-6 border border-slate-100">

            <h3 className="text-2xl font-bold text-[#041B46] mb-5">Tasks & Reminders</h3>



            <div className="space-y-4">

              {[

                'Follow up with Tapiwa Moyo',

                'Site visit - Alpha Engineering',

                'Prepare proposal - Greenview Cottage',

                'Monthly sales report',

              ].map((task) => (

                <div key={task} className="flex items-center gap-3 bg-slate-50 rounded-2xl p-4">

                  <div className="h-5 w-5 rounded-md border-2 border-orange-500"></div>

                  <p className="font-medium">{task}</p>

                </div>

              ))}

            </div>

          </div>

        </div>

      </section>

    </div>

  </main>

</div>



); }



Build a full-stack enterprise CRM and operations platform for RoyEno Solartech using React, TailwindCSS, Node.js, PostgreSQL, and modern SaaS UI design. The system should manage the complete solar sales and operations lifecycle from lead generation to installation, payments, support, and maintenance. Create a modern orange and navy blue themed dashboard with modules for Leads, Clients, Sales Pipeline, Quotes, Proposals, Installations, Technician Scheduling, Products & Solar Systems, Payments, Invoices, Reports, Analytics, Marketing, Tasks, Calendar, and Notifications. The platform must support adding and managing client profiles with phone numbers, GPS location, installation address, system type, inverter model, battery details, warranty tracking, documents, notes, and installation history. Include role-based dashboards for sales agents, technicians, supervisors, finance teams, and administrators. Add lead tracking stages, task management, reminders, installation scheduling, field technician assignment, revenue analytics, reporting dashboards, and customer communication logs. Backend should use Node.js with Express or NestJS, PostgreSQL database, JWT authentication, REST APIs, file upload support, and scalable architecture. Prepare the system for future integrations with 3CX PBX, WhatsApp APIs, solar monitoring systems, AI analytics, and mobile apps. The design should feel premium, futuristic, clean, responsive, and enterprise-grade like Salesforce or HubSpot, optimized for desktop usage by call center agents and solar operations teams.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://helios-cadence.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/59eb73e4-1723-4e95-84d7-b933c19c996d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
