

const registerUser = async (req, res) => {
    try {
        res.status(200).json({
            message: "Registration successful",
        });
    } catch (error) {
        throw Error
    }
};


export {registerUser};