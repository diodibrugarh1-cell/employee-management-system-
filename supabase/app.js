const {
    createClient
} = supabase;

const sb = createClient(
    window.APP_CONFIG.SUPABASE_URL,
    window.APP_CONFIG.SUPABASE_ANON_KEY
);

let session = null;
let profile = null;
let employees = [];
let filteredEmployees = [];

const $ = id => document.getElementById(id);

const esc = value =>
    String(value ?? "")
        .replace(
            /[&<>"']/g,
            character =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                }[character])
        );

const fmtDate = date => {

    if (!date) return "";

    return new Date(
        date + "T00:00:00"
    ).toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );
};


/*
==================================================
RETIREMENT CALCULATION
==================================================

Rule:

DOB + 60 years
then last day of that month.

Example:

DOB: 15/03/1985
60 years: 15/03/2045
Retirement: 31/03/2045
*/

function retirementDate(dob) {

    if (!dob)
        return "";

    const date =
        new Date(
            dob + "T00:00:00"
        );

    const year =
        date.getFullYear() + 60;

    const month =
        date.getMonth();

    return new Date(
        year,
        month + 1,
        0
    );
}


function iso(date) {

    return date
        ? date.toISOString().slice(0, 10)
        : "";
}


/*
==================================================
INITIALIZATION
==================================================
*/

async function init() {

    const {
        data: {
            session: currentSession
        }
    } =
        await sb.auth.getSession();

    if (currentSession)

        await enterApp(
            currentSession
        );

    else

        showLogin();


    sb.auth.onAuthStateChange(
        async (_event, newSession) => {

            if (newSession)

                await enterApp(
                    newSession
                );

            else

                showLogin();

        }
    );
}


function showLogin() {

    $("loginView")
        .classList
        .remove("hidden");

    $("appView")
        .classList
        .add("hidden");
}


/*
==================================================
ENTER APPLICATION
==================================================
*/

async function enterApp(currentSession) {

    session =
        currentSession;

    const {
        data,
        error
    } =
        await sb
            .from("profiles")
            .select("*")
            .eq(
                "id",
                session.user.id
            )
            .single();

    if (error) {

        $("loginError")
            .textContent =
            "User profile not found. Contact the administrator.";

        await sb.auth.signOut();

        return;
    }

    profile =
        data;

    $("loginView")
        .classList
        .add("hidden");

    $("appView")
        .classList
        .remove("hidden");

    document.body.className =
        "role-" + profile.role;

    $("userBadge")
        .textContent =
        `${profile.full_name} • ${profile.role.replace("_", " ")}`;

    await loadEmployees();

    if (
        profile.role === "admin"
    ) {

        await loadUsers();

    }
}


/*
==================================================
LOGIN
==================================================
*/

$("loginForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            $("loginError")
                .textContent = "";

            const {
                error
            } =
                await sb.auth
                    .signInWithPassword({

                        email:
                            $("loginEmail")
                                .value
                                .trim(),

                        password:
                            $("loginPassword")
                                .value

                    });

            if (error)

                $("loginError")
                    .textContent =
                    error.message;

        }
    );


/*
==================================================
LOGOUT
==================================================
*/

$("logoutBtn").onclick =
    () => sb.auth.signOut();


/*
==================================================
CHANGE PASSWORD
==================================================
*/

$("changePasswordBtn")
    .onclick = () => {

        $("passwordError")
            .textContent = "";

        $("newPassword")
            .value = "";

        $("confirmPassword")
            .value = "";

        $("passwordDialog")
            .showModal();
    };


$("passwordForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const password =
                $("newPassword")
                    .value;

            const confirmPassword =
                $("confirmPassword")
                    .value;

            if (
                password !==
                confirmPassword
            ) {

                $("passwordError")
                    .textContent =
                    "Passwords do not match.";

                return;
            }

            const {
                error
            } =
                await sb.auth
                    .updateUser({
                        password
                    });

            if (error) {

                $("passwordError")
                    .textContent =
                    error.message;

            } else {

                $("passwordDialog")
                    .close();

                alert(
                    "Password changed successfully."
                );

            }

        }
    );


/*
==================================================
NAVIGATION
==================================================
*/

document
    .querySelectorAll(".tab")
    .forEach(button => {

        button.onclick = () => {

            document
                .querySelectorAll(".tab")
                .forEach(item =>
                    item.classList
                        .remove("active")
                );

            document
                .querySelectorAll(".tab-panel")
                .forEach(item =>
                    item.classList
                        .remove("active")
                );

            button.classList
                .add("active");

            $(
                button.dataset.tab
            )
                .classList
                .add("active");

        };

    });


/*
==================================================
LOAD EMPLOYEES
==================================================
*/

async function loadEmployees() {

    const {
        data,
        error
    } =
        await sb
            .from("employees")
            .select("*")
            .order(
                "name"
            );

    if (error) {

        alert(
            error.message
        );

        return;
    }

    employees =
        data || [];

    populatePostingFilter();

    renderAll();
}


/*
==================================================
POSTING FILTER
==================================================
*/

function populatePostingFilter() {

    const places =
        [
            ...new Set(
                employees
                    .map(
                        employee =>
                            employee.place_of_posting
                    )
                    .filter(Boolean)
            )
        ]
        .sort();

    $("postingFilter")
        .innerHTML =
        '<option value="">All Posting Places</option>' +

        places
            .map(
                place =>
                    `<option>${esc(place)}</option>`
            )
            .join("");
}


/*
==================================================
RENDER EMPLOYEES
==================================================
*/

function renderAll() {

    filteredEmployees =
        employees.filter(
            employee => {

                const query =
                    $("searchInput")
                        .value
                        .toLowerCase();

                const matchesSearch =
                    !query ||

                    [
                        employee.employee_code,
                        employee.name,
                        employee.post_designation,
                        employee.place_of_posting
                    ]
                    .some(
                        value =>
                            String(
                                value || ""
                            )
                            .toLowerCase()
                            .includes(query)
                    );

                const matchesGrade =
                    !$("gradeFilter")
                        .value ||

                    employee.grade ===
                    $("gradeFilter").value;

                const matchesType =
                    !$("typeFilter")
                        .value ||

                    employee.employment_type ===
                    $("typeFilter").value;

                const matchesPosting =
                    !$("postingFilter")
                        .value ||

                    employee.place_of_posting ===
                    $("postingFilter").value;

                return (
                    matchesSearch &&
                    matchesGrade &&
                    matchesType &&
                    matchesPosting
                );

            }
        );


    $("employeeBody")
        .innerHTML =

        filteredEmployees.length

            ?

            filteredEmployees
                .map(employee => `

<tr>

<td>
${esc(employee.employee_code)}
</td>

<td>
<strong>
${esc(employee.name)}
</strong>
</td>

<td>
${esc(employee.grade)}
</td>

<td>
${esc(employee.employment_type)}
</td>

<td>
${esc(employee.post_designation)}
</td>

<td>
${esc(employee.place_of_posting)}
</td>

<td>
${fmtDate(employee.dob)}
</td>

<td>
${fmtDate(employee.joining_date)}
</td>

<td>
${fmtDate(employee.retirement_date)}
</td>

<td>

${
    profile.role !== "viewer"

        ?

        `
        <button
            class="small-btn"
            onclick="editEmployee('${employee.id}')"
        >
            Edit
        </button>
        `

        :

        ""
}

${
    profile.role === "admin"

        ?

        `
        <button
            class="small-btn delete"
            onclick="deleteEmployee('${employee.id}')"
        >
            Delete
        </button>
        `

        :

        ""
}

</td>

</tr>

`)
                .join("")

            :

            `
<tr>
<td
    colspan="10"
    class="empty"
>
No records found.
</td>
</tr>
`;


    renderDashboard();
}


/*
==================================================
DASHBOARD
==================================================
*/

function renderDashboard() {

    const total =
        employees.length;

    const regular =
        employees.filter(
            employee =>
                employee.employment_type ===
                "Regular"
        ).length;

    const contractual =
        employees.filter(
            employee =>
                employee.employment_type ===
                "Contractual"
        ).length;

    const now =
        new Date();

    const next =
        new Date(now);

    next.setFullYear(
        now.getFullYear() + 1
    );

    const upcoming =
        employees
            .filter(employee => {

                const date =
                    retirementDate(
                        employee.dob
                    );

                return (
                    date >= now &&
                    date <= next
                );

            })
            .sort(
                (a, b) =>
                    retirementDate(a.dob) -
                    retirementDate(b.dob)
            );


    $("statTotal")
        .textContent =
        total;

    $("statRegular")
        .textContent =
        regular;

    $("statContractual")
        .textContent =
        contractual;

    $("statRetire")
        .textContent =
        upcoming.length;


    const grades = [

        "Grade 1",
        "Grade 2",
        "Grade 3",
        "Grade 4"

    ];


    $("gradeSummary")
        .innerHTML =
        grades
            .map(
                grade => `

<div class="summary-row">

<span>
${grade}
</span>

<strong>
${
    employees.filter(
        employee =>
            employee.grade === grade
    ).length
}
</strong>

</div>
`
            )
            .join("");


    $("typeSummary")
        .innerHTML =

        [
            "Regular",
            "Contractual"
        ]
        .map(
            type => `

<div class="summary-row">

<span>
${type}
</span>

<strong>
${
    employees.filter(
        employee =>
            employee.employment_type === type
    ).length
}
</strong>

</div>

`
        )
        .join("");


    $("retirementBody")
        .innerHTML =

        upcoming.length

            ?

            upcoming
                .slice(0, 30)
                .map(
                    employee => `

<tr>

<td>
${esc(employee.name)}
</td>

<td>
${esc(employee.post_designation)}
</td>

<td>
${esc(employee.place_of_posting)}
</td>

<td>
${fmtDate(employee.dob)}
</td>

<td>
${fmtDate(employee.retirement_date)}
</td>

</tr>

`
                )
                .join("")

            :

            `
<tr>
<td
    colspan="5"
    class="empty"
>
No retirements in the next 12 months.
</td>
</tr>
`;
}


/*
==================================================
FILTERS
==================================================
*/

[
    "searchInput",
    "gradeFilter",
    "typeFilter",
    "postingFilter"
]
.forEach(
    id =>
        $(id)
            .addEventListener(
                "input",
                renderAll
            )
);


$("clearFilters")
    .onclick = () => {

        [
            "searchInput",
            "gradeFilter",
            "typeFilter",
            "postingFilter"
        ]
        .forEach(
            id =>
                $(id).value = ""
        );

        populatePostingFilter();

        renderAll();

    };


/*
==================================================
ADD EMPLOYEE
==================================================
*/

$("addEmployeeBtn")
    .onclick =
    () => openEmployee();


function openEmployee(employee = null) {

    $("employeeDialogTitle")
        .textContent =
        employee
            ? "Edit Employee"
            : "Add Employee";


    $("employeeId")
        .value =
        employee?.id || "";


    $("fEmployeeCode")
        .value =
        employee?.employee_code || "";


    $("fName")
        .value =
        employee?.name || "";


    $("fGrade")
        .value =
        employee?.grade || "Grade 4";


    $("fType")
        .value =
        employee?.employment_type ||
        "Regular";


    $("fPost")
        .value =
        employee?.post_designation ||
        "";


    $("fPosting")
        .value =
        employee?.place_of_posting ||
        "";


    $("fDob")
        .value =
        employee?.dob || "";


    $("fJoining")
        .value =
        employee?.joining_date ||
        "";


    $("fMobile")
        .value =
        employee?.mobile ||
        "";


    $("fRemarks")
        .value =
        employee?.remarks ||
        "";


    updateRetirementPreview();


    $("employeeError")
        .textContent = "";


    $("employeeDialog")
        .showModal();
}


$("fDob")
    .addEventListener(
        "input",
        updateRetirementPreview
    );


function updateRetirementPreview() {

    const date =
        retirementDate(
            $("fDob").value
        );


    $("retirementPreview")
        .textContent =

        date

            ?

            date.toLocaleDateString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "long",
                    year: "numeric"
                }
            )

            :

            "—";
}


/*
==================================================
SAVE EMPLOYEE
==================================================
*/

$("employeeForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            $("employeeError")
                .textContent = "";


            const payload = {

                employee_code:
                    $("fEmployeeCode")
                        .value
                        .trim(),

                name:
                    $("fName")
                        .value
                        .trim(),

                grade:
                    $("fGrade")
                        .value,

                employment_type:
                    $("fType")
                        .value,

                post_designation:
                    $("fPost")
                        .value
                        .trim(),

                place_of_posting:
                    $("fPosting")
                        .value
                        .trim(),

                dob:
                    $("fDob")
                        .value,

                joining_date:
                    $("fJoining")
                        .value,

                mobile:
                    $("fMobile")
                        .value
                        .trim(),

                remarks:
                    $("fRemarks")
                        .value
                        .trim()

            };


            const id =
                $("employeeId")
                    .value;


            let response;


            if (id) {

                response =
                    await sb
                        .from("employees")
                        .update(payload)
                        .eq(
                            "id",
                            id
                        );

            } else {

                response =
                    await sb
                        .from("employees")
                        .insert(
                            payload
                        );

            }


            if (response.error) {

                $("employeeError")
                    .textContent =
                    response.error.message;

                return;
            }


            $("employeeDialog")
                .close();


            await loadEmployees();

        }
    );


/*
==================================================
EDIT EMPLOYEE
==================================================
*/

window.editEmployee =
    id => {

        const employee =
            employees.find(
                item =>
                    item.id === id
            );


        if (employee)
            openEmployee(employee);

    };


/*
==================================================
DELETE EMPLOYEE
==================================================
*/

window.deleteEmployee =
    async id => {

        if (
            !confirm(
                "Delete this employee record?"
            )
        )
            return;


        const {
            error
        } =
            await sb
                .from("employees")
                .delete()
                .eq(
                    "id",
                    id
                );


        if (error)

            alert(
                error.message
            );

        else

            await loadEmployees();

    };


/*
==================================================
CSV EXPORT
==================================================
*/

$("exportCsvBtn")
    .onclick = () => {

        const columns = [

            "employee_code",
            "name",
            "grade",
            "employment_type",
            "post_designation",
            "place_of_posting",
            "dob",
            "joining_date",
            "retirement_date",
            "mobile",
            "remarks"

        ];


        const csv = [

            columns.join(","),

            ...filteredEmployees.map(
                employee =>

                    columns
                        .map(
                            column =>
                                `"${String(
                                    employee[column] ?? ""
                                ).replaceAll(
                                    '"',
                                    '""'
                                )}"`
                        )
                        .join(",")
            )

        ]
        .join("\r\n");


        const blob =
            new Blob(
                ["\ufeff" + csv],
                {
                    type:
                        "text/csv;charset=utf-8"
                }
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            URL.createObjectURL(
                blob
            );


        link.download =
            "employee_records.csv";


        link.click();


        URL.revokeObjectURL(
            link.href
        );

    };


/*
==================================================
PRINT
==================================================
*/

$("printBtn")
    .onclick =
    () => window.print();


/*
==================================================
USER MANAGEMENT
==================================================
*/

async function loadUsers() {

    const {
        data,
        error
    } =
        await sb
            .from("profiles")
            .select(
                "id,full_name,email,role,created_at"
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    if (error) {

        console.error(error);

        return;
    }


    $("usersBody")
        .innerHTML =

        (data || [])
            .map(
                user => `

<tr>

<td>
${esc(user.full_name)}
</td>

<td>
${esc(user.email)}
</td>

<td>

<span class="status-pill">
${esc(user.role)}
</span>

</td>

<td>
${new Date(
    user.created_at
).toLocaleDateString("en-IN")}
</td>

<td>

${
    user.id === session.user.id

        ?

        "Current user"

        :

        `
        <button
            class="small-btn delete"
            onclick="removeUser('${user.id}')"
        >
            Delete
        </button>
        `
}

</td>

</tr>
`
            )
            .join("");
}


/*
==================================================
CREATE LOGIN
==================================================
*/

$("addUserBtn")
    .onclick = () => {

        $("userError")
            .textContent = "";


        [
            "uName",
            "uEmail",
            "uPassword"
        ]
        .forEach(
            id =>
                $(id).value = ""
        );


        $("userDialog")
            .showModal();
    };


$("userForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            $("userError")
                .textContent = "";


            const {
                data,
                error
            } =
                await sb.functions
                    .invoke(
                        "create-user",
                        {
                            body: {

                                full_name:
                                    $("uName")
                                        .value
                                        .trim(),

                                email:
                                    $("uEmail")
                                        .value
                                        .trim(),

                                password:
                                    $("uPassword")
                                        .value,

                                role:
                                    $("uRole")
                                        .value

                            }
                        }
                    );


            if (
                error ||
                data?.error
            ) {

                $("userError")
                    .textContent =
                    error?.message ||
                    data.error;

                return;
            }


            $("userDialog")
                .close();


            await loadUsers();


            alert(
                "Login created successfully."
            );

        }
    );


/*
==================================================
DELETE USER
==================================================
*/

window.removeUser =
    async id => {

        if (
            !confirm(
                "Delete this login?"
            )
        )
            return;


        const {
            data,
            error
        } =
            await sb.functions
                .invoke(
                    "delete-user",
                    {
                        body: {
                            user_id: id
                        }
                    }
                );


        if (
            error ||
            data?.error
        ) {

            alert(
                error?.message ||
                data.error
            );

            return;
        }


        await loadUsers();

    };


/*
==================================================
START APPLICATION
==================================================
*/

init();
